# Setup and Execution Guide

This document describes the verified setup and execution steps to run the Agentic AI Voice Interview Platform locally.

## Prerequisites

- **Python 3.11** (Required for compatibility with speech synthesis and AI agents)
- **Node.js & npm** (Required for React frontend compilation and dev server)

---

## 1. Environment Configuration

The application requires API keys for speech-to-text, text-to-speech, and language modeling agents.

Create a `.env` file in the root directory (and copy it into the `backend/` directory for backend access) containing:

```env
GROQ_API_KEY="your_groq_api_key"
DEEPGRAM_API_KEY="your_deepgram_api_key"
NVIDIA_API_KEY="your_nvidia_api_key"
DATABASE_URL=sqlite:///./interview_platform.db
CHROMA_PATH=./chroma_db
SECRET_KEY=9d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

---

## 2. Backend Setup & Feature Verification

### Step A: Initialize the Virtual Environment
Navigate to the root directory of the project and create a Python virtual environment:

```bash
# Create the virtual environment using Python 3.11
python3.11 -m venv venv

# Activate the virtual environment
source venv/bin/activate
```

### Step B: Install Dependencies
Install the required packages along with the document generation library:

```bash
# Install core requirements
pip install -r requirements.txt

# Install PDF generation tool
pip install reportlab
```

### Step C: Verify Features
Verify the integrations (Speech synthesis fallback, Groq model, and PDF reports) by running the test suite:

```bash
python test_all_features.py
```

### Step D: Run the Backend API Server
Navigate to the `backend/` directory and run the FastAPI server:

```bash
cd backend
../venv/bin/uvicorn app.main:app --reload --port 8000
```
The API documentation will be available at `http://127.0.0.1:8000/docs`.

---

## 3. Frontend Setup & Execution

Open a new terminal session, navigate to the `frontend/` directory, and start the development server:

```bash
cd frontend

# Install package dependencies
npm install

# Start Vite dev server
npm run dev
```

The React frontend interface will be available at [http://localhost:5173/](http://localhost:5173/).
