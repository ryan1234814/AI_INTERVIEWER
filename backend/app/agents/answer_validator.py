import logging
from langchain_groq import ChatGroq
from app.config import settings

logger = logging.getLogger(__name__)

class AnswerValidationAgent:
    """
    Agent responsible for checking the factual and technical correctness of the user's answer.
    """
    def __init__(self, groq_api_key: str = settings.GROQ_API_KEY):
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0.1)
        self.system_prompt = """You are the Answer Validation Agent. Your role is to rigorously check the
factual and technical correctness of the interviewee's response. You must
use available tools and knowledge to validate the answer against expected
criteria. Provide a clear assessment of correctness, completeness, and any
inaccuracies. Be objective and precise.

Input details you will receive:
- Question: The question asked by the interviewer.
- Answer: The candidate's response.
- Job Context: The job description and requirements.

Output requirements:
1. Relevance score (0-10)
2. Technical accuracy score (0-10)
3. Completeness score (0-10)
4. Key strengths of the answer
5. Inaccuracies or gaps identified
6. Concise feedback for the candidate

Format your output as JSON."""

    def validate_answer(self, question: str, answer: str, job_context: str) -> dict:
        try:
            prompt = f"{self.system_prompt}\n\nQuestion: {question}\nAnswer: {answer}\nJob Context: {job_context}\n\nValidation JSON:"
            response = self.llm.invoke(prompt)
            # Simple JSON extraction (can be improved with Pydantic)
            import json
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            result = json.loads(content)
            logger.info(f"[Validator] completeness={result.get('completeness', 'N/A')}, accuracy={result.get('technical_accuracy', 'N/A')}")
            return result
        except Exception as e:
            logger.error(f"AnswerValidationAgent error: {e}")
            return {
                "relevance_score": 5,
                "technical_accuracy": 5,
                "completeness": 5,  # Default to middle value to allow progression
                "strengths": [],
                "inaccuracies": [],
                "feedback": "Answer received. Let's move on."
            }
