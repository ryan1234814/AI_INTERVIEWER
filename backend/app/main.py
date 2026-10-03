import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes import auth, interviews, candidates, jobs, voice, websocket, proctoring
from app.database.base import Base
from app.database.session import engine
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)

# Columns added after the first release of this database. Base.metadata.create_all
# only builds missing *tables*, so new columns on existing tables are applied
# here. Every entry is idempotent and no column is ever dropped.
_NEW_COLUMNS = [
    ("interviews", "planned_questions", "JSON"),
    # user_id is nullable so pre-auth rows survive the upgrade; the API filters
    # on user_id == current_user.id, which keeps those legacy rows private.
    ("interviews", "user_id", "INTEGER REFERENCES users (id)"),
    ("job_descriptions", "user_id", "INTEGER REFERENCES users (id)"),
    ("candidates", "user_id", "INTEGER REFERENCES users (id)"),
]


def _ensure_schema():
    """Create tables and add columns/indexes introduced after a database existed."""
    Base.metadata.create_all(bind=engine)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        for table, column, ddl in _NEW_COLUMNS:
            if table not in tables:
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            logger.info("Schema: added %s.%s", table, column)

        # Candidate email used to be globally unique, which let one account's
        # candidate block (or be overwritten by) another's. Replace it with
        # per-owner uniqueness.
        if "candidates" in tables:
            indexes = {i["name"] for i in inspect(engine).get_indexes("candidates")}
            with engine.begin() as conn:
                if "ix_candidates_email" in indexes:
                    conn.execute(text("DROP INDEX IF EXISTS ix_candidates_email"))
                    logger.info("Schema: dropped global candidates.email unique index")
                if "ix_candidates_email_user_id" not in indexes:
                    conn.execute(text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_candidates_email_user_id "
                        "ON candidates (email, user_id)"
                    ))
                    logger.info("Schema: added composite candidates (email, user_id) unique index")
    except Exception as e:  # never block startup on a best-effort migration
        logger.warning("Schema ensure step failed (continuing): %s", e)


_ensure_schema()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS — strictly restricted to configured origins
cors_origins = settings.BACKEND_CORS_ORIGINS
logger.info("CORS allowed origins: %s", cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(jobs.router, prefix=f"{settings.API_V1_STR}/jobs", tags=["Jobs"])
app.include_router(candidates.router, prefix=f"{settings.API_V1_STR}/candidates", tags=["Candidates"])
app.include_router(interviews.router, prefix=f"{settings.API_V1_STR}/interviews", tags=["Interviews"])
app.include_router(voice.router, prefix=f"{settings.API_V1_STR}/voice", tags=["Voice"])
app.include_router(proctoring.router, prefix=f"{settings.API_V1_STR}/interviews", tags=["Proctoring"])
app.include_router(websocket.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Agentic AI Voice Interview Platform API"}
