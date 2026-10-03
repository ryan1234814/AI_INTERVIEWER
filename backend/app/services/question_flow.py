"""Question sequencing helpers shared by the voice and text interview paths.

These exist to guarantee forward progress. Previously the interviewer had no
memory of which questions were planned, so whenever an LLM call failed the
fallbacks re-asked the *current* question and the candidate heard question 1
over and over. Everything here is pure and LLM-free so it keeps working even
when the model provider is down.
"""

import json
import logging
import re
from typing import Any, List

logger = logging.getLogger(__name__)

# Shown when an interview has no planned bank (e.g. created before the
# planned_questions column existed) and nothing has been answered yet.
OPENING_QUESTION = "Please introduce yourself and tell me about your background."

# Generic probes used only when the planned bank is exhausted and the LLM is
# unreachable. Rotated by question index so consecutive turns never repeat.
PROBE_BANK = [
    "Could you give a specific example that best illustrates that?",
    "What was the hardest part of that work, and how did you handle it?",
    "How would you measure whether that approach actually succeeded?",
    "What would you do differently if you had to redo it?",
    "Tell me about a time that approach did not work out as planned.",
]


# Phrases that mean "please say the current question again".
# Matched case-insensitively as substrings so STT variants still hit.
REPEAT_REQUEST_PHRASES = [
    "repeat the question",
    "repeat that",
    "repeat question",
    "say that again",
    "say it again",
    "say again",
    "come again",
    "pardon",
    "could you repeat",
    "can you repeat",
    "please repeat",
    "repeat please",
    "didn't hear",
    "didnt hear",
    "did not hear",
    "couldn't hear",
    "couldnt hear",
    "could not hear",
    "didn't catch",
    "didnt catch",
    "missed that",
    "one more time",
    "ask again",
]


def is_repeat_request(text: str) -> bool:
    """True when the candidate is asking to hear the question again."""
    t = (text or "").lower().strip()
    if not t:
        return False
    # Short explicit asks ("repeat?", "pardon?") count on their own.
    if t in {"repeat", "repeat?", "pardon?", "again?", "sorry?"}:
        return True
    return any(phrase in t for phrase in REPEAT_REQUEST_PHRASES)


def normalize(text: str) -> str:
    """Lowercase, drop punctuation — used to compare question wording."""
    return re.sub(r"[^a-z0-9 ]+", "", (text or "").lower()).strip()


def is_repeat(candidate: str, asked: str) -> bool:
    """True when `candidate` is effectively the same question as `asked`.

    Substring matching matters because the follow-up agent's re-ask style wraps
    the original wording ("Let me rephrase that — <question>"), which reads as a
    different string to an equality check but is the same question to the
    candidate.
    """
    a, b = normalize(candidate), normalize(asked)
    if not a or not b:
        return False
    if a == b:
        return True
    # Only treat containment as a repeat for reasonably long questions, so a
    # short new question isn't swallowed by a longer one.
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return len(shorter) >= 25 and shorter in longer


def parse_planned(raw: Any) -> List[str]:
    """Coerce the stored planned_questions value into a list of strings."""
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []
    if not isinstance(raw, list):
        return []
    return [str(q).strip() for q in raw if q and str(q).strip()]


def planned_question(planned: List[str], index: int) -> str:
    """Planned question at `index`, or '' when the bank has nothing there."""
    if planned and 0 <= index < len(planned):
        return (planned[index] or "").strip()
    return ""


def resume_index(planned: List[str], stored_index: int, answered_questions: List[str]) -> int:
    """First planned index the candidate has NOT answered yet.

    The stored progress counter alone is not enough: a follow-up deliberately
    leaves it on the current question, so trusting it verbatim would replay a
    question that was already answered after a reconnect.
    """
    idx = max(int(stored_index or 0), 0)
    answered = {normalize(q) for q in answered_questions if q}
    while planned and idx < len(planned) and normalize(planned[idx]) in answered:
        idx += 1
    return idx


def opening_question(planned: List[str], current_index: int, has_answers: bool) -> str:
    """Question to resume on.

    Uses the planned question at the stored index so a reconnect continues where
    the candidate left off instead of restarting from the introduction.
    """
    q = planned_question(planned, current_index)
    if q:
        return q
    if not has_answers and current_index <= 0:
        return OPENING_QUESTION
    # Bank is shorter than the stored index: rotate a generic probe rather than
    # replaying question 0.
    return PROBE_BANK[current_index % len(PROBE_BANK)]


def rotating_probe(index: int) -> str:
    """A follow-up probe that varies with `index` (never repeats the last ask)."""
    return PROBE_BANK[index % len(PROBE_BANK)]


def clip(text: str, limit: int) -> str:
    """Truncate `text` to `limit` characters, keeping a whole word where possible."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Prefer not to slice mid-word at the tail of the prompt.
    space = cut.rfind(" ")
    return cut[:space].strip() if space > limit // 2 else cut.strip()


def trim_history(history: List[dict], max_turns: int = 4, answer_limit: int = 300) -> List[dict]:
    """Keep only the recent Q/A turns, with answers clipped.

    The consistency agent is fed the whole interview so far; with long spoken
    answers that blows the prompt past what the free Groq tier's tokens-per-minute
    budget allows, and the resulting 429s push every agent onto its fallback path.
    Recent turns are enough to spot contradictions.
    """
    trimmed = []
    for item in (history or [])[-max_turns:]:
        trimmed.append({
            "question": clip(item.get("question", ""), 200),
            "answer": clip(item.get("answer", ""), answer_limit),
        })
    return trimmed
