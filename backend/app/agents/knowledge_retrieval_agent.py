import logging
from langchain_groq import ChatGroq
from app.config import settings

logger = logging.getLogger(__name__)

class KnowledgeRetrievalAgent:
    """
    Agent responsible for providing context for questions and validation.
    Currently uses LLM as a world-knowledge source, but designed to be hooked into Vector DBs.
    """
    def __init__(self, groq_api_key: str = settings.GROQ_API_KEY):
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0)

    def retrieve_context(self, topic: str) -> str:
        try:
            prompt = f"Provide a brief (3-4 bullet points) technical overview of the following topic for an interviewer: {topic}"
            response = self.llm.invoke(prompt)
            return response.content
        except Exception as e:
            logger.error(f"KnowledgeRetrievalAgent error: {e}")
            return "General technical knowledge on the topic."
