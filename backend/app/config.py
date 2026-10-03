import json
import logging
import os
from typing import Optional, List
from pydantic import field_validator
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_DATABASE_URL = "sqlite:///./interview_platform.db"


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
    # os.getenv only applies its fallback when the variable is absent, so a
    # present-but-empty DATABASE_URL (a truncated paste into Render's prompt is
    # the usual cause) reached create_engine("") and raised ArgumentError during
    # module import — before uvicorn could bind $PORT, with a traceback that never
    # named the env var. The validator normalises that to the SQLite default.
    DATABASE_URL: str = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    CHROMA_PATH: str = os.getenv("CHROMA_PATH", "./chroma_db")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalise_database_url(cls, value):
        raw = str(value or "").strip()
        if not raw:
            logger.warning(
                "DATABASE_URL is set but empty; falling back to %s. Any data written "
                "there is lost on the next redeploy — set the Neon pooled URL.",
                DEFAULT_DATABASE_URL,
            )
            return DEFAULT_DATABASE_URL
        # Name the driver we actually install. A bare postgresql:// URL resolved to
        # psycopg2 under SQLAlchemy 2.0 but to psycopg (v3) in 2.1, so the same
        # pasted Neon string booted locally and crashed on Render with
        # "No module named 'psycopg'". The legacy postgres:// alias does not resolve
        # at all on either line. An explicit +psycopg2 URL is version-independent.
        for prefix in ("postgresql://", "postgres://"):
            if raw.startswith(prefix):
                return "postgresql+psycopg2://" + raw[len(prefix):]
        return raw

    # CORS — comma-separated list of allowed origins
    # Defaults to local dev frontend; set to deployed URL(s) in production
    #
    # Typed as str on purpose. pydantic-settings JSON-decodes any field annotated
    # as a complex type (List[str]) BEFORE the class-body default runs, so
    # BACKEND_CORS_ORIGINS=https://foo.vercel.app — exactly what the platform
    # dashboard sets — raised SettingsError and killed startup. Use cors_origins
    # to get the parsed list.
    BACKEND_CORS_ORIGINS: str = os.getenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Auth brute-force protection: max attempts per minute, per IP (and per
    # email on login). In-process sliding window, see app/utils/rate_limit.py.
    AUTH_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "10"))

    class Config:
        case_sensitive = True

    @property
    def cors_origins(self) -> List[str]:
        """Allowed origins, accepting either CSV or a JSON list.

        Starlette matches the request's Origin header against these entries
        *exactly*, and browsers never send a trailing slash — so an origin pasted
        as "https://app.vercel.app/" would allow nothing at all while GET / still
        returned 200 and Render reported a healthy deploy. Stripping the slash
        makes the paste-tolerant form safe.
        """
        raw = (self.BACKEND_CORS_ORIGINS or "").strip()
        if raw.startswith("["):
            try:
                origins = [str(o).strip().rstrip("/") for o in json.loads(raw) if str(o).strip()]
            except (json.JSONDecodeError, TypeError, ValueError):
                logger.warning("BACKEND_CORS_ORIGINS is not valid JSON; falling back to CSV split")
                origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
        else:
            origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
        if not origins:
            logger.warning(
                "BACKEND_CORS_ORIGINS parsed to an empty list: no frontend origin will be "
                "allowed, so every browser call fails CORS even though the API is healthy"
            )
        return origins


settings = Settings()

# Validate that a production-grade SECRET_KEY is provided
_PLACEHOLDER_SECRETS = {"your-secret-key-here", "replace-with-a-generated-secret-key", "__GENERATE_A_REAL_SECRET__"}

if not settings.SECRET_KEY or settings.SECRET_KEY in _PLACEHOLDER_SECRETS:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set or still uses a placeholder value! "
        "Generate a secure key with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
