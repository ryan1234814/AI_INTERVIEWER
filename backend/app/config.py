import os
from typing import Optional, List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    PROJECT_NAME: str = "Agentic AI Voice Interview Platform"
    API_V1_STR: str = "/api/v1"

    # API Keys (all Optional to avoid validation errors when not set)
    GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY")
    DEEPGRAM_API_KEY: Optional[str] = os.getenv("DEEPGRAM_API_KEY")
    NVIDIA_API_KEY: Optional[str] = os.getenv("NVIDIA_API_KEY")
    DASHSCOPE_API_KEY: Optional[str] = os.getenv("DASHSCOPE_API_KEY")

    # LLM / STT models
    # Groq retires model names regularly, so these are configurable rather than
    # hardcoded: repointing the app at a live model is then a .env change only.
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    GROQ_FAST_MODEL: str = os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
    GROQ_STT_MODEL: str = os.getenv("GROQ_STT_MODEL", "whisper-large-v3")

    # Interview pacing
    # Max probing follow-up questions inserted per planned question before the
    # interview must advance. Bounds the follow-up path so a candidate can never
    # be re-asked the same question indefinitely.
    MAX_FOLLOW_UPS_PER_QUESTION: int = int(os.getenv("MAX_FOLLOW_UPS_PER_QUESTION", "1"))

    # Prompt budgets (characters / turns)
    # Groq's free tier caps tokens-per-minute, and every agent call in a turn
    # repeats the job context and the answer history. Oversized prompts burn the
    # budget and come back as 429 rate-limit errors, forcing agents onto their
    # fallback paths, so the context fed to the LLM is deliberately bounded here.
    LLM_JOB_CONTEXT_CHARS: int = int(os.getenv("LLM_JOB_CONTEXT_CHARS", "1200"))
    LLM_HISTORY_TURNS: int = int(os.getenv("LLM_HISTORY_TURNS", "4"))

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./interview_platform.db")
    CHROMA_PATH: str = os.getenv("CHROMA_PATH", "./chroma_db")

    # CORS — comma-separated list of allowed origins
    # Defaults to local dev frontend; set to deployed URL(s) in production
    BACKEND_CORS_ORIGINS: List[str] = [
        o.strip() for o in os.getenv(
            "BACKEND_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if o.strip()
    ]

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Auth brute-force protection: max attempts per minute, per IP (and per
    # email on login). In-process sliding window, see app/utils/rate_limit.py.
    AUTH_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "10"))

    class Config:
        case_sensitive = True


settings = Settings()

# Validate that a production-grade SECRET_KEY is provided
_PLACEHOLDER_SECRETS = {"your-secret-key-here", "replace-with-a-generated-secret-key", "__GENERATE_A_REAL_SECRET__"}

if not settings.SECRET_KEY or settings.SECRET_KEY in _PLACEHOLDER_SECRETS:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set or still uses a placeholder value! "
        "Generate a secure key with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
