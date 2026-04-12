import logging
from langchain_groq import ChatGroq
from app.config import settings
from typing import List

logger = logging.getLogger(__name__)

class ConsistencyCheckingAgent:
    """
    Agent meant to track contradictions or inconsistencies across a candidate's answers.
    """
    def __init__(self, groq_api_key: str = settings.GROQ_API_KEY):
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0.1)
        self.system_prompt = """You are the Consistency Checking Agent. Your role is to ensure the logical
coherence and consistency of the interviewee's responses throughout the
entire interview. You must track and compare answers, identifying any
contradictions, factual discrepancies, or significant shifts in their
statements. Flag these inconsistencies for further investigation or
clarification.

Input will be:
- The full history of the interview (previous questions and answers).
- The current answer from the candidate.

Your task:
Check if the current answer contradicts anything stated before.
Provide a clear analysis of any mismatches found.
Suggest a clarification question if an inconsistency is detected.

Output as JSON."""

    def check_consistency(self, history: List[dict], current_answer: str) -> dict:
        try:
            formatted_history = "\n".join([f"Q: {h['question']}\nA: {h['answer']}" for h in history])
            prompt = f"{self.system_prompt}\n\nInterview History:\n{formatted_history}\n\nCurrent Answer: {current_answer}\n\nConsistency Report (JSON):"
            response = self.llm.invoke(prompt)
            
            import json
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            return json.loads(content)
        except Exception as e:
            logger.error(f"ConsistencyCheckingAgent error: {e}")
            return {"inconsistency_detected": False, "analysis": "Error during consistency check.", "clarification_question": None}
