from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes import interviews, candidates, jobs, voice, websocket
from app.database.base import Base
from app.database.session import engine

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(jobs.router, prefix=f"{settings.API_V1_STR}/jobs", tags=["Jobs"])
app.include_router(candidates.router, prefix=f"{settings.API_V1_STR}/candidates", tags=["Candidates"])
app.include_router(interviews.router, prefix=f"{settings.API_V1_STR}/interviews", tags=["Interviews"])
app.include_router(voice.router, prefix=f"{settings.API_V1_STR}/voice", tags=["Voice"])
app.include_router(websocket.router)

@app.get("/")
async def root():
    return {"message": "Welcome to the Agentic AI Voice Interview Platform API"}
