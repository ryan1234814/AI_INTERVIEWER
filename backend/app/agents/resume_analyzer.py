import logging
from typing import Dict, Any, List
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
import pdfplumber

logger = logging.getLogger(__name__)

class ResumeAnalysis(BaseModel):
    name: str = Field(description="Name of the candidate")
    skills: List[str] = Field(description="List of technical and soft skills")
    experience_years: float = Field(description="Total years of experience")
    summary: str = Field(description="Brief summary of professional background")
    key_achievements: List[str] = Field(description="Key professional achievements")

class ResumeAnalyzerAgent:
    def __init__(self, groq_api_key: str):
        self.llm = ChatGroq(
            api_key=groq_api_key,
            model="llama-3.3-70b-versatile",
            temperature=0.1
        )
        self.parser = PydanticOutputParser(pydantic_object=ResumeAnalysis)

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        text = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() + "\n"
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            raise e
        return text

    def analyze_resume(self, pdf_path: str) -> Dict[str, Any]:
        text = self.extract_text_from_pdf(pdf_path)
        
        prompt = PromptTemplate(
            template="""Analyze the following resume text and extract key information.
{format_instructions}

Resume Text:
{resume_text}
""",
            input_variables=["resume_text"],
            partial_variables={"format_instructions": self.parser.get_format_instructions()}
        )
        
        chain = prompt | self.llm | self.parser
        
        try:
            result = chain.invoke({"resume_text": text})
            return result.dict()
        except Exception as e:
            logger.error(f"Error analyzing resume: {e}")
            raise e
