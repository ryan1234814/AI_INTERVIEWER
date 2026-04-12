# Agentic AI Voice Interview Platform

The Agentic AI Voice Interview Platform is a production-ready system that conducts intelligent, voice-based AI interviews by analyzing job descriptions and candidate resumes. This platform combines a sophisticated multi-agent architecture with free, open-source speech-to-text (STT) and text-to-speech (TTS) models to create a seamless voice interview experience.

## Features
- **Multi-Agent Orchestration**: Powered by LangGraph, CrewAI, and Agno.
- **Natural Voice Interaction**: Uses Groq (Llama 3 70B) for intelligence and Edge-TTS for high-quality, free voice synthesis.
- **Smart Knowledge Retrieval**: Integration with ChromaDB for context-aware Interviewing.
- **Real-time Performance**: WebSocket-based communication for low-latency voice interaction.

## Prerequisites
- **Python 3.11** (Required for compatibility with all AI and voice libraries)
- **Node.js & npm** (For the React frontend)
- **Groq API Key** (Set in `.env`)
- **NVIDIA API Key** (For STT processing)

## Setup and Execution

### 1. Backend Setup
Navigate to the backend directory and set up your environment:
```bash
cd backend
# Recommended: Create and activate a virtual environment with Python 3.11
# python3.11 -m venv venv
# source venv/bin/activate

# Install dependencies
python3.11 -m pip install -r ../requirements.txt
```

#### Run the Backend
```bash
python3.11 -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
Navigate to the frontend directory:
```bash
cd frontend
npm install
```

#### Run the Frontend
```bash
npm run dev
```
The frontend will be available at `http://localhost:5173`.

## Environment Configuration
Ensure your `backend/.env` file contains the following:
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `NVIDIA_API_KEY`
- `DATABASE_URL=sqlite:///./interview_platform.db`

## Tech Stack
- **Backend**: FastAPI, LangChain, LangGraph, SQL Alchemy, ChromaDB.
- **Frontend**: React, Vite, TailwindCSS, Framer Motion.
- **Voice**: Edge-TTS (TTS), NVIDIA Riva/Deepgram (STT).