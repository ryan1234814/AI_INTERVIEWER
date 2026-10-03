from typing import Dict, List, Any
import logging
import re
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

from app.config import settings

logger = logging.getLogger(__name__)


class QuestionGeneratorAgent:
    def __init__(self, groq_api_key: str):
        self.llm = ChatGroq(
            api_key=groq_api_key,
            model=settings.GROQ_MODEL,
            temperature=0.7
        )

    def generate_questions(
        self,
        job_description: str,
        candidate_skills: List[str],
        count: int = 5
    ) -> List[str]:
        template = """You are a senior technical recruiter generating interview questions.
Based on the job description and the candidate's skills, generate {count} unique, challenging, yet fair interview questions.
The questions should cover technical expertise, problem-solving, and culture fit.

Job Description:
{job_description}

Candidate Skills:
{candidate_skills}

Generate exactly {count} questions, one per line, starting with a number.
Return ONLY the questions.
"""
        prompt = PromptTemplate(
            template=template,
            input_variables=["job_description", "candidate_skills", "count"]
        )
        
        try:
            response = self.llm.invoke(prompt.format(
                job_description=job_description,
                candidate_skills=", ".join(candidate_skills),
                count=count
            ))

            questions = self._parse_questions(response.content, count)
            if questions:
                return questions
            logger.warning("Question generator produced no parsable questions; using fallback")
        except Exception as e:
            logger.error(f"Error generating questions: {e}")

        # Always return a full bank of `count` questions. A short list would leave
        # the interview with nothing to advance to and force repeats.
        return self._fallback_questions(candidate_skills, count)

    @staticmethod
    def _parse_questions(content: str, count: int) -> List[str]:
        """Extract numbered/bulleted question lines without mangling inner periods."""
        cleaned = re.sub(r"```[a-zA-Z]*", "", content or "")
        out: List[str] = []
        seen = set()
        for raw in cleaned.split("\n"):
            line = raw.strip().strip("*").strip()
            if not line:
                continue
            # Strip a leading enumerator: "1.", "1)", "Q1:", "1 -"
            line = re.sub(r"^(?:q(?:uestion)?\s*)?\d+\s*[.)\-:]\s*", "", line, flags=re.IGNORECASE).strip()
            line = re.sub(r"^question\s*[:\-]\s*", "", line, flags=re.IGNORECASE).strip()
            if len(line) < 8:
                continue
            key = line.lower().rstrip("?!. ")
            if key in seen:
                continue
            seen.add(key)
            out.append(line)
            if len(out) >= count:
                break
        return out

    @staticmethod
    def _fallback_questions(candidate_skills: List[str], count: int) -> List[str]:
        skill = (candidate_skills[0] if candidate_skills and candidate_skills[0] else "your core skill")
        bank = [
            f"Can you tell me about your experience with {skill} and how you have applied it?",
            "Describe a technically challenging project you delivered and the decisions you made.",
            "How do you approach debugging a problem you have never seen before?",
            "Tell me about a time your initial technical approach failed. What did you do next?",
            "How do you decide between building something quickly and building it robustly?",
            "What does your testing and review process look like for production work?",
            "Describe a disagreement you had with a teammate and how you resolved it.",
            "What is the most complex system you understand well enough to explain to others?",
        ]
        return bank[:max(count, 1)]

    def generate_followup(self, response: str, question: str) -> str:
        template = """You are an interviewer. The candidate just gave an answer to your question.
Ask a short, natural follow-up question (max 2 sentences) to probe deeper into their answer.
Do NOT restate or re-ask the original question.

Original Question: {question}
Candidate's Answer: {response}

Follow-up Question:"""
        prompt = PromptTemplate(
            template=template,
            input_variables=["question", "response"]
        )
        
        try:
            followup = self.llm.invoke(prompt.format(question=question, response=response))
            text = followup.content.strip()
            # Guard against the model echoing the question back (would look like a repeat)
            if not text or text.lower().rstrip("?!. ") == question.lower().rstrip("?!. "):
                return "Could you give a specific example that best illustrates that?"
            return text
        except Exception as e:
            logger.error(f"Error generating follow-up: {e}")
            return "Could you elaborate more on that part?"