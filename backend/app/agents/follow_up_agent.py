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
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0.7)
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
            return "Could you elaborate more on that project?"
