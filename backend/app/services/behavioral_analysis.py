import re
import json
import logging
from typing import Dict, Any, List
from app.config import settings

logger = logging.getLogger(__name__)

FILLER_WORDS = [
    "um", "uh", "like", "you know", "so", "actually", "basically",
    "literally", "kind of", "sort of", "i mean", "well", "hmm", "ah"
]
FILLER_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(w) for w in FILLER_WORDS) + r')\b',
    re.IGNORECASE
)

SENTIMENT_LEXICON_POS = {"great","excellent","confident","enjoy","love","passionate","excited","strong","success","achieved","proud","good","positive","motivated"}
SENTIMENT_LEXICON_NEG = {"struggle","difficult","fail","failed","weak","nervous","unsure","hard","bad","negative","frustrated","confused","uncertain"}


def analyze_speech_metrics(text: str, audio_duration_sec: float = None) -> Dict[str, Any]:
    """Deterministic speech metrics from transcript alone."""
    if not text or not text.strip():
        return {
            "word_count": 0, "filler_count": 0, "filler_rate": 0.0,
            "filler_words_found": [], "wpm": 0, "lexical_diversity": 0,
            "avg_word_length": 0, "hesitation_score": 10
        }
    words = re.findall(r"\b\w+\b", text.lower())
    word_count = len(words)
    fillers = FILLER_PATTERN.findall(text.lower())
    # handle multi-word fillers: count occurrences via regex finditer
    filler_matches = [m.group(0).lower() for m in FILLER_PATTERN.finditer(text.lower())]
    filler_count = len(filler_matches)
    filler_rate = round((filler_count / word_count * 100) if word_count else 0, 1)
    unique_words = len(set(words))
    lexical_diversity = round(unique_words / word_count, 2) if word_count else 0
    avg_word_length = round(sum(len(w) for w in words) / word_count, 1) if word_count else 0
    # WPM: if duration known use it, else estimate 130 wpm baseline and penalize filler
    if audio_duration_sec and audio_duration_sec > 0:
        wpm = round(word_count / (audio_duration_sec / 60))
    else:
        # heuristic: estimate duration ~ word_count * 0.45s per word ( ~133 wpm ideal )
        wpm = 0  # unknown without audio; frontend can supply duration if available
    # hesitation 0-10: lower filler = higher score
    hesitation_score = max(0, min(10, round(10 - filler_rate * 0.8, 1)))
    # also detect repeated sentences / very short answers
    return {
        "word_count": word_count,
        "filler_count": filler_count,
        "filler_rate": filler_rate,
        "filler_words_found": filler_matches[:10],
        "wpm": wpm,
        "lexical_diversity": lexical_diversity,
        "avg_word_length": avg_word_length,
        "hesitation_score": hesitation_score,
    }


def quick_sentiment(text: str) -> Dict[str, Any]:
    words = set(re.findall(r"\b\w+\b", text.lower()))
    pos = len(words & SENTIMENT_LEXICON_POS)
    neg = len(words & SENTIMENT_LEXICON_NEG)
    if pos > neg:
        label = "positive"
        score = min(10, 6 + pos)
    elif neg > pos:
        label = "negative"
        score = max(0, 4 - neg)
    else:
        label = "neutral"
        score = 5
    return {"label": label, "score": score, "pos": pos, "neg": neg}


class BehavioralAnalysisAgent:
    """LLM-powered behavioral & soft-skill analysis (STAR, communication, confidence)."""

    def __init__(self, groq_api_key: str = None):
        self.groq_api_key = groq_api_key or settings.GROQ_API_KEY
        self.llm = None
        if self.groq_api_key:
            try:
                from langchain_groq import ChatGroq
                # try primary model, fallback to 8b if not available at runtime
                self.llm = ChatGroq(api_key=self.groq_api_key, model="llama-3.1-8b-instant", temperature=0.2)
            except Exception as e:
                logger.warning(f"Behavioral LLM init failed: {e}")

    def analyze(self, question: str, answer: str, job_context: str = "") -> Dict[str, Any]:
        speech = analyze_speech_metrics(answer)
        sentiment = quick_sentiment(answer)

        # Fallback if LLM unavailable or answer too short
        if len(answer.strip()) < 10 or "[No response" in answer:
            return self._fallback(question, answer, speech, sentiment)
        if not self.llm:
            return self._fallback(question, answer, speech, sentiment)

        prompt = f"""You are a Behavioral & Soft-Skill Interview Analyst.
Evaluate the candidate's answer for communication and behavioral quality.

Question: {question}
Answer: {answer}
Job Context: {job_context[:600]}
Speech Metrics: filler_rate={speech['filler_rate']}%, word_count={speech['word_count']}, hesitation={speech['hesitation_score']}/10
Sentiment heuristic: {sentiment['label']}

Score 0-10 for each dimension:
- clarity: structure, conciseness, articulation
- confidence: decisiveness, no hedging
- star_structure: STAR method (Situation/Task/Action/Result) if behavioral question else structure
- empathy_teamwork: collaboration, listening, empathy signals
- sentiment: positivity/professionalism

Also provide:
- strengths: list of 1-2 strings
- improvements: list of 1-2 strings
- star_breakdown: object with situation/task/action/result each 0-10 or null if not applicable
- summary: 1 sentence

Return ONLY valid JSON with keys: clarity, confidence, star_structure, empathy_teamwork, sentiment, strengths, improvements, star_breakdown, summary
"""
        try:
            resp = self.llm.invoke(prompt)
            content = resp.content
            # extract json
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            data = json.loads(content)
            # normalize
            for k in ["clarity","confidence","star_structure","empathy_teamwork","sentiment"]:
                if k in data:
                    try:
                        data[k] = max(0, min(10, float(data[k])))
                    except:
                        data[k] = 5
            data["speech_metrics"] = speech
            data["sentiment_heuristic"] = sentiment
            return data
        except Exception as e:
            logger.warning(f"Behavioral LLM failed: {e}, using fallback")
            return self._fallback(question, answer, speech, sentiment)

    def _fallback(self, question: str, answer: str, speech: dict, sentiment: dict) -> Dict[str, Any]:
        wc = speech["word_count"]
        # heuristic scores
        if wc == 0:
            clarity = 0
            confidence = 0
            star = 0
            empathy = 0
        elif wc < 10:
            clarity = 3
            confidence = 4
            star = 2
            empathy = 4
        elif wc < 30:
            clarity = 5 + speech["hesitation_score"] * 0.15
            confidence = 5
            star = 4
            empathy = 5
        else:
            clarity = min(9, 6 + speech["lexical_diversity"] * 4)
            confidence = speech["hesitation_score"] * 0.7 + 3
            star = 6 if "situation" in answer.lower() or "result" in answer.lower() else 5
            empathy = 6

        is_behavioral = any(k in question.lower() for k in ["tell me about a time","describe a situation","challenge","conflict","team","leadership","failure"])
        star_breakdown = {
            "situation": round(star,1) if is_behavioral else None,
            "task": round(star,1) if is_behavioral else None,
            "action": round(star,1) if is_behavioral else None,
            "result": round(star,1) if is_behavioral else None,
        }
        return {
            "clarity": round(clarity,1),
            "confidence": round(confidence,1),
            "star_structure": round(star,1),
            "empathy_teamwork": round(empathy,1),
            "sentiment": float(sentiment["score"]),
            "strengths": ["Clear attempt"] if wc>15 else ["Concise response"],
            "improvements": ["Add specific examples (STAR)"] if is_behavioral else ["Elaborate with more detail"],
            "star_breakdown": star_breakdown,
            "summary": "Heuristic behavioral assessment (LLM unavailable).",
            "speech_metrics": speech,
            "sentiment_heuristic": sentiment,
            "fallback": True
        }


# Convenience singleton
_agent = None
def get_behavioral_agent():
    global _agent
    if _agent is None:
        _agent = BehavioralAnalysisAgent()
    return _agent

def analyze_response(question: str, answer: str, job_context: str = "", audio_duration: float = None) -> Dict[str, Any]:
    agent = get_behavioral_agent()
    # if duration provided recompute wpm
    result = agent.analyze(question, answer, job_context)
    if audio_duration:
        sm = result.get("speech_metrics", {})
        if sm.get("word_count") and audio_duration > 0:
            sm["wpm"] = round(sm["word_count"] / (audio_duration / 60))
    return result
