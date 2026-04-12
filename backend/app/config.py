import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Agentic AI Voice Interview Platform"
    API_V1_STR: str = "/api/v1"
    
    # API Keys
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY")
    NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./interview_platform.db")
    CHROMA_PATH: str = os.getenv("CHROMA_PATH", "./chroma_db")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        case_sensitive = True

settings = Settings()
