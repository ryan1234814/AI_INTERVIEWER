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
- **Groq API Key** — see `.env.example` for setup
- **NVIDIA API Key** — see `.env.example` for setup

## Setup and Execution

Please see [setup.md](file:///Users/ryangeorge/ai_interviewer/setup.md) for the detailed step-by-step setup guide.

### Quick Start:

1. **Environment Setup**:
   ```bash
   cp .env.example .env
   cp .env.example backend/.env
   # Then edit both .env files with your actual API keys
   ```

2. **Backend**:
   ```bash
   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install reportlab
   
   # Run tests
   python test_all_features.py
   
   # Run server
   cd backend
   ../venv/bin/uvicorn app.main:app --reload --port 8000
   ```

3. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

## Environment Configuration

Copy `.env.example` (at the project root) to `.env` in both the root and `backend/` directories, then fill in your actual values:

```bash
cp .env.example .env
cp .env.example backend/.env
```

The `.env.example` file documents every variable, its purpose, and where to obtain API keys. A valid `SECRET_KEY` is **required** — generate one with:

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

> **Note**: `SECRET_KEY` must be a high-entropy key. The application will refuse to start if it is missing or still set to a placeholder.

## Tech Stack
- **Backend**: FastAPI, LangChain, LangGraph, SQL Alchemy, ChromaDB.
- **Frontend**: React, Vite, TailwindCSS, Framer Motion.
- **Voice**: Edge-TTS (TTS), NVIDIA Riva/Deepgram (STT).