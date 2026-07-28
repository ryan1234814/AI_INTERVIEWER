# Setup and Execution Guide

This document describes the verified setup and execution steps to run the Agentic AI Voice Interview Platform locally.

## Prerequisites

- **Python 3.11** (Required for compatibility with speech synthesis and AI agents)
- **Node.js & npm** (Required for React frontend compilation and dev server)

---

## 1. Environment Configuration

The application requires API keys for speech-to-text, text-to-speech, and language modeling agents.

Copy the `.env.example` file from the project root to both the root and `backend/` directories, then fill in your actual values:

```bash
cp .env.example .env
cp .env.example backend/.env
```

The `.env.example` file documents every variable, its purpose, and where to obtain API keys. A valid `SECRET_KEY` is **required** — generate one with:

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

> **Note**: `SECRET_KEY` must be a high-entropy key. The application will refuse to start if it is missing or still set to a placeholder.

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
