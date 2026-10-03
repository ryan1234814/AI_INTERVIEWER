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
`requirements.txt` lists every package the app imports, including `reportlab`
(which the PDF report needs), so one command is enough:

```bash
pip install -r requirements.txt
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

---

## 4. Production Deployment (Render backend + Vercel frontend)

The stack must be split: Vercel hosts static files and short-lived serverless
functions only, while an interview runs a persistent WebSocket for voice input,
so the backend needs a real long-lived container (Render).

### 4.1 Push the current code

Render and Vercel both deploy from the GitHub repo, so nothing local will show
up until it is pushed:

```bash
git add -A && git commit -m "Deploy fixes: reportlab dependency, CORS env parsing, SPA rewrites, trimmed requirements" && git push origin main
```

### 4.2 Create a free Postgres database (Neon)

1. [console.neon.tech](https://console.neon.tech) → **New project**. Pick the region
   closest to the Render service, not to you — every query crosses that gap. Render's
   default region is **Oregon (us-west-2)**, so a Neon region in `us-west-2` or
   `us-east-1` is the cheapest hop. If you already created the project in
   `ap-south-1` (Mumbai), switch the Render service to **Singapore** instead; region
   cannot be changed on an existing Neon branch.
2. On the **Connection Details** page, switch on **Pooled connection** and copy that
   string — its host contains `-pooler`, e.g.
   `postgresql://user:pass@ep-xxxx-pooler.<region>.aws.neon.tech/db?sslmode=require`.
   The pooled endpoint is required: a voice interview keeps one connection open for
   the entire session, and the direct endpoint has too few connections on the free
   plan. Keep `?sslmode=require`; Neon rejects unencrypted connections.
3. Paste it into `DATABASE_URL`. Leave the database empty — the app creates its
   tables on first boot (`Base.metadata.create_all` plus the idempotent
   `_ensure_schema()` upgrades in `backend/app/main.py`).

Nothing else is needed from Neon. There is no Neon SDK, CLI login, `neon link` or
`neon.ts` in play: this backend is plain Python (SQLAlchemy + `psycopg2`) talking to
Postgres over that URL, so the "Set up Neon with your coding agent" prompt in the
console can be skipped. `backend/app/database/session.py` already sets
`pool_pre_ping` + `pool_recycle` for non-SQLite URLs, which is what stops the first
request after a Neon scale-to-zero wake-up from failing on a connection the pooler
had already dropped.

### 4.3 Deploy the backend on Render

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint** →
   connect `ryan1234814/AI_INTERVIEWER`. Render reads `render.yaml` from the repo
   root and shows the service definition.
2. It prompts for the three `sync: false` values:
   - `DATABASE_URL` — the pooled Neon string from 4.2
   - `BACKEND_CORS_ORIGINS` — your Vercel origin from 4.4, e.g.
     `https://your-app.vercel.app` (no trailing slash). If you have not created
     the Vercel project yet, deploy the backend first with any value and update
     this later; a wrong value only breaks browser calls, not the deploy itself.
   - `GROQ_API_KEY` — from [console.groq.com/keys](https://console.groq.com/keys)
3. **Apply** and watch the build. Expected log milestones:
   `pip install -r requirements.txt` (a couple of minutes now that torch is gone),
   then `Uvicorn running on http://0.0.0.0:10000` and a `200 OK` for `/`.
4. Sanity-check it directly (CORS is not involved for curl):

```bash
curl https://<service>.onrender.com/
curl https://<service>.onrender.com/api/v1/auth/me   # expect 401 {"detail":"Not authenticated"}
```

### 4.4 Deploy the frontend on Vercel

1. [vercel.com/new](https://vercel.com/new) → import the same repo.
2. **Root Directory**: `frontend` (important — `vercel.json` lives there).
   Framework preset *Vite*, build command `npm run build`, output `dist` are
   already supplied by `frontend/vercel.json`; the `rewrites` entry in that file
   is what makes `/login`, `/signup` and `/dashboard` load on a hard refresh.
3. **Environment Variables** — add both, for Production *and* Preview:
   - `VITE_API_URL=https://<service>.onrender.com` (no trailing slash, no `/api/v1`
     — the axios client appends it). Without this the SPA calls Vercel's own
     origin, the SPA rewrite answers with `index.html`, and every request fails
     with a JSON-parse error instead of a clean 404.
   - `VITE_WS_URL=wss://<service>.onrender.com` (optional: it is derived from
     `VITE_API_URL` automatically, but setting it explicitly is clearer).
   These are baked in at build time, so **redeploy after changing them**.
4. Deploy, copy the `https://<project>.vercel.app` URL, then go back to Render →
   **Environment** → set `BACKEND_CORS_ORIGINS` to exactly that origin and add
   `https://<project>-git-main-<user>.vercel.app` if you want preview builds to
   work too (comma-separated) → **Save and Redploy**.

### 4.5 Known free-tier limits

| Limit | Effect | Fix |
|---|---|---|
| Instance sleeps after ~15 min | first request takes ~50 s; a live interview's WebSocket drops | point a free UptimeRobot monitor at `https://<service>.onrender.com/` every 14 min, or switch `render.yaml` to `plan: starter` |
| Ephemeral filesystem | uploaded resume PDFs disappear on each redeploy (interview data is safe in Postgres) | `plan: starter` + a Persistent Disk, with `UPLOAD_DIR` set to its mount path |
| In-process auth rate limiting | the per-minute login limit is per instance | irrelevant on one instance; use a shared store if you ever scale out |
| WebSocket has no JWT yet | anyone who guesses an interview id could drive that session | authenticate the socket (`?token=` plus a `decode_token` check in `backend/app/routes/websocket.py`) before sharing the URL publicly |

### 4.6 GitHub Pages workflow

`.github/workflows/jekyll-gh-pages.yml` still publishes the repo as a Jekyll site
on every push (its `validate-env` job is the useful `.env.example` sync check).
With the SPA on Vercel, turn Pages off in GitHub → Settings → Pages, or delete
the build/deploy jobs and keep `validate-env`.
