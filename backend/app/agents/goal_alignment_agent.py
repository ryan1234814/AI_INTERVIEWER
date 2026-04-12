import logging
from langchain_groq import ChatGroq
from app.config import settings

logger = logging.getLogger(__name__)

class GoalAlignmentAgent:
    """
    Agent that ensures the interview flow remains aligned with a predefined overarching goal.
    """
    def __init__(self, groq_api_key: str = settings.GROQ_API_KEY):
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0.3)
        self.system_prompt = """You are the Goal Alignment Agent. Your paramount role is to ensure the
entire interview process remains strictly aligned with the predefined
overarching goal (e.g., "prepare for FAANG system design interview,"
"improve behavioral storytelling"). You must continuously monitor the flow,
questions, and candidate responses, providing guidance to other agents to
maintain focus on achieving measurable outcomes. Prevent the interview from
deviating into irrelevant topics or random questioning."""

    def align_question(self, current_goal: str, next_planned_question: str, job_context: str) -> str:
        try:
            prompt = f"{self.system_prompt}\n\nInterview Goal: {current_goal}\nJob Context: {job_context}\nPlanned Next Question: {next_planned_question}\n\nTask: Refine the planned question to better align with the goal. If it's already aligned, return it as is. Output only the refined question text."
            response = self.llm.invoke(prompt)
            return response.content.strip()
        except Exception as e:
            logger.error(f"GoalAlignmentAgent error: {e}")
            return next_planned_question
