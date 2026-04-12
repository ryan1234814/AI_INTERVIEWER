from typing import Dict, List, Any
import logging
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

logger = logging.getLogger(__name__)

class QuestionGeneratorAgent:
    def __init__(self, groq_api_key: str):
        self.llm = ChatGroq(
            api_key=groq_api_key,
            model="llama-3.3-70b-versatile",
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
            
            lines = response.content.strip().split("\n")
            questions = [line.split(".", 1)[1].strip() if "." in line else line.strip() for line in lines if line.strip()]
            return questions[:count]
        except Exception as e:
            logger.error(f"Error generating questions: {e}")
            # Return default questions instead of raising
            return [f"Can you tell me about your experience with {candidate_skills[0] if candidate_skills else 'this technology'}?"]

    def generate_followup(self, response: str, question: str) -> str:
        template = """You are an interviewer. The candidate just gave an answer to your question.
Ask a short, natural follow-up question (max 2 sentences) to probe deeper into their answer.

Original Question: {question}
Candidate's Answer: {response}

Follow-up Question:"""
        prompt = PromptTemplate(
            template=template,
            input_variables=["question", "response"]
        )
        
        try:
            followup = self.llm.invoke(prompt.format(question=question, response=response))
            return followup.content.strip()
        except Exception as e:
            logger.error(f"Error generating follow-up: {e}")
            return "Could you elaborate more on that part?"