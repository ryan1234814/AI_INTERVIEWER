import logging
from langchain_groq import ChatGroq
from app.config import settings

logger = logging.getLogger(__name__)

class FollowUpQuestionAgent:
    """
    Agent responsible for generating deep, context-aware follow-up questions
    based on the user’s previous answer.
    """
    def __init__(self, groq_api_key: str = settings.GROQ_API_KEY):
        self.llm = ChatGroq(api_key=groq_api_key, model=settings.GROQ_MODEL, temperature=0.7)
        self.system_prompt = """You are the Follow-up Question Agent. Your role is to generate insightful
and probing follow-up questions. Based on the candidate's previous answer,
identify gaps, ambiguities, or opportunities for deeper exploration. Craft
questions that test their understanding, critical thinking, and ability to
elaborate, mimicking a skilled human interviewer. Avoid superficial or
repetitive questions.

Follow-up questions should:
1. Probe deeper into technical implementations mentioned.
2. Ask for specific examples if the candidate was too general.
3. Challenge assumptions made by the candidate.
4. Test the limits of the candidate's knowledge on the topic.

Keep the question concise and natural for a voice interview (max 2 sentences)."""

    def generate_follow_up(self, original_question_text: str, candidate_answer: str, context: str) -> str:
        try:
            prompt = f"{self.system_prompt}\n\nContext: {context}\nOriginal Question: {original_question_text}\nAnswer: {candidate_answer}\n\nFollow-up Question:"
            response = self.llm.invoke(prompt)
            return response.content.strip()
        except Exception as e:
            logger.error(f"FollowUpQuestionAgent error: {e}")
            # Generic probe — must not echo the original question, or the
            # candidate hears the same question twice.
            return "Could you give a specific example that best illustrates that?"

    def generate_simplified_reask_and_followup(self, original_question_text: str, candidate_answer: str, context: str) -> str:
        """
        When the candidate's answer is incomplete or unclear, re-ask the original
        question in a much simpler, more accessible way, then follow up with a
        probing question — all in one natural voice-friendly message.
        """
        reask_prompt = """You are a friendly, patient technical interviewer. The candidate just gave
an answer that was incomplete or unclear. Your job is to:

1. Re-ask the ORIGINAL QUESTION in a much simpler, plainer, more
   accessible way (as if explaining to someone new to the topic). Keep
   this to 1-2 short sentences.
2. Then, add a brief follow-up that probes deeper into a specific part
   of their answer (1 sentence).

IMPORTANT:
- The simplified re-ask must preserve the core intent of the original question.
- Sound natural and encouraging, like a real human interviewer.
- Keep the entire response concise — no more than 3 sentences total.
- Do NOT use bullet points or numbering. Speak naturally.

Context: {context}
Original Question: {original_question_text}
Candidate's Answer: {candidate_answer}

Your response (simplified re-ask + follow-up):"""
        try:
            prompt = reask_prompt.format(
                context=context,
                original_question_text=original_question_text,
                candidate_answer=candidate_answer
            )
            response = self.llm.invoke(prompt)
            return response.content.strip()
        except Exception as e:
            logger.error(f"FollowUpQuestionAgent simplified_reask error: {e}")
            # Never fall back to re-asking the original question verbatim — that is
            # what caused the interview to loop on the same question forever.
            return "Could you walk me through that in a bit more detail?"
