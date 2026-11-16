# Agentic AI Voice Interview Platform — Architecture

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               USERS                                         │
│   (recruiter/hiring manager setting up interviews; candidate taking them)  │
└────────────┬──────────────────────────────────────────────────────┬─────────┘
             │                                                      │
             │ HTTPS / REST + JWT Bearer tokens                     │ voice (Mic) + webcam
             ▼                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND — Vercel (static + rewrites)               │
│  React 18 + Vite 8 + TypeScript + TailwindCSS + Framer Motion              │
│                                                                             │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │ AuthContext   │  │  App + Routes    │  │  Dashboard                   │  │
│  │ - JWT in      │  │  / · /login ·    │  │  - list of user's interviews │  │
│  │   localStorage│  │   /signup ·      │  │  - per-session analytics     │  │
│  │ - 401 →       │  │   /dashboard     │  │  - PDF report download       │  │
│   redirect      │  │  (protected)     │  └─────────────────────────────┘  │  │
│  ┌───────────────┐  └──────────────────┘  ┌─────────────────────────────┐  │
│  │ axios client  │                        │  InterviewSession            │  │
│  │   - VITE_API  │                        │  ┌────────────┐ ┌─────────┐ │  │
│  │     _URL →    │                        │  │  Web Socket│ │ Mic +   │ │  │
│  │     /api/v1   │                        │  │  client    │ │ webcam  │ │  │
│  │   - relative  │                        │  └────────────┘ └────┬────┘ │  │
│  │     fallback  │                        │        │  ↑            │     │  │
│  └───────────────┘                        │        │  │  MediaRe-    │     │  │
│  ┌───────────────┐                        │        ▼  recorder + STT │     │  │
│  │ useProctoring │───────────────────────▶├────── Audio  ────────────┤     │  │
│  │ (client-side) │                        │   transcript    ▼         │     │  │
│  │ - COCO-SSD    │                        │  WebSocket WS/interview/  │     │  │
│  │   object/face │                        │          {id}             │     │  │
│  │ - FaceDetector│                        └──────────┬────────────────┘     │  │
│  │ - tab visibili-│                         ┌───────┴────────────┐          │  │
│  │   ty monitor  │                         │       BACKEND —    │          │  │
│  └───────────────┘                         │     Render (long-  │          │  │
│                                             │   lived container)  │          │  │
│                                             │                     │          │  │
│                                             │  ┌── main.py ──┐  │          │  │
│                                             │  │ FastAPI     │  │          │  │
│                                             │  │ CORS + 7    │  │          │  │
│                                             │  │ routers     │  │          │  │
│                                             │  └───┬─────────┘  │          │  │
│   ┌──────────────┐                            │      │         │          │  │
│   │ ThemeProvider│                            │      ▼         │          │  │
│   │ + ErrorBound- │                            │  ┌──────────────┐          │  │
│   │ ary          │                            │  │ database/     │          │  │
│   └──────────────┘                            │  │ session.py    │          │  │
│                                               │  │ base.py       │          │  │
│                                               │  │ models.py     │          │  │
│                                               │  │ crud.py       │          │  │
│                                               │  └──────┬────────┘          │  │
│   ┌──────────────┐                            │         │                  │  │
│   │   Store /    │◀───────────────────────────┼─────────┼──────────────────┘  │  │
│   │   hooks      │                            │         ▼                  │  │
│   └──────────────┘                            │  ┌──────────────┐           │  │
│                                               │  │ routes/      │           │  │
│                                               │  │ auth · jobs · │           │  │
│                                               │  │ candidates ·  │           │  │
│   ┌──────────────┐                            │  │ interviews    │           │  │
│   │ components   │                            │  │ proctoring    │           │  │
│   │ SetupInterview│                           │  │ websocket     │           │  │
│   │ InterviewSession│                         │  └───────┬──────┘           │  │
│   │ InterviewDashboard│                       │        │                     │  │
│   │ SessionAnalytics│◀───── analytics payload │        │                     │  │
│   └──────────────┘                            │        │                     │  │
│                                               │        ▼                     │  │
│   ┌──────────────┐                            │  ┌──────────────┐           │  │
│   │   pages/     │                            │  │ agents/       │           │  │
│   │ Home (state  │◀───────────────────────────┼──┤ question_gen  │           │  │
│   │   machine)   │    interview setup result  │  │ resume_analyze│           │  │
│   └──────────────┘                            │  │ answer_valid  │           │  │
│                                               │  │ follow_up     │           │  │
│   ┌──────────────┐                            │  │ consistency   │           │  │
│   │ utils/       │                            │  │ goal_align    │           │  │
│   │ proctoring.ts│◀───────────────────────────┼──┤ difficulty    │           │  │
│   │ (policy)     │                            │  │ pacing        │           │  │
│   └──────────────┘                            │  └───────┬──────┘           │  │
│                                               │        │ (LangChain /      │  │
│   ┌──────────────┐                            │        ▼                   │  │
│   │ services/    │                            │  ┌──────────────┐           │  │
│   │ api.ts       │                            │  │ voice/        │           │  │
│   └──────────────┘                            │  │ VoiceManager  │           │  │
│                                               │  │ TTS (Qwen/gTTS) │          │  │
│                                               │  │ STT (Groq/Deepgrm) │        │  │
│   ┌──────────────┐                            │  │ pdf_generator │           │  │
│   │ store/       │◀────────── interview list ─┼──┤ rate_limit.py │           │  │
│   │ (if used)    │                            │  └──────────────┘           │  │
│   └──────────────┘                            └──────────────┬─────────────┘  │  │
│                                                             │                 │  │
│                                                             ▼                 │  │
│   ┌──────────────┐                            ┌───────────────┐              │  │
│   │ public assets│                            │   storage     │              │  │
│   │ (index.html, │                            │               │              │  │
│   │   bundled JS,│                            │  ┌──────────┐  │              │  │
│   │   wasm (tfjs)│                            │  │ PostgreSQL│  │              │  │
│   └──────────────┘                            │  │  (Neon)   │  │              │  │
│         │              │                      │  │           │  │              │  │
│         │              │                      │  └───────────┘  │              │  │
│         │    ──── npm install ───────────────►│   uploads/     │              │  │
│         │        (tfjs + coco-ssd wasm)      │   (resume PDFs)│              │  │
│         │                                   │   (Persistent  │              │  │
│         │                                   │    Disk on prod)│             │  │
│         └────────────────────────────────────┴───────────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ GROQ (LLM + Whisper) ·
                                             │ Deepgram · DashScope/Qwen ·
                                             │ NVIDIA (optional)
                                             ▼
```

---

## 2. Request/flow diagrams

### 2.1 Setting up an interview (HTTP)

```
Frontend (/)  ──POST──>  routes/interviews.setup
  job title/desc + resume PDF
        │
        ▼
  1. save resume → backend/uploads/
  2. pdfplumber extract text
  3. ResumeAnalyzerAgent (or keyword fallback) → skills + summary
  4. create_job_description + create_candidate (user_id scoped)
  5. QuestionGeneratorAgent → planned_questions bank (num_questions)
     (+ filler fallback to cap the bank; dedupe repeats)
  6. create_interview(status=pending → ready) + write first-question placeholder
        │
  Frontend  ◀──{ interview_id, questions }──  backend
        │
        └─▶ WebSocket  WS/interview/{id}   (voice session)
```

### 2.2 A single interview turn (WebSocket)

```
client sends:  JSON { content: transcript }   OR   audio bytes (MediaRecorder)
        │
        ▼  routes/websocket.py (loop)
        │  1. proctor frame?  → POST/POST → proctoring service → ProctorEvent
        │  2. context: history (last LLM_HISTORY_TURNS), goal
        │  3. VoiceManager.run_agent(transcript, context)
        │       ├─ TTS already playing? (speak next_question to candidate)
        │       └─ agents.VoiceInterviewerAgent.conduct_interview
        │             repeat-echo → validator → consistency → difficulty
        │             → follow_up? → goal_align → repeat-guard
        │  4. sequence: follow_up → stay on index; else index+1, budget reset
        │  5. save InterviewResponse + update Interview.current_question_index
        │     (persisted BEFORE sending, so reconnects resume forward)
        │  6. send back: { next_question, evaluation, is_follow_up, behavioral }
        │
candidate hears next question ──▶ speaks ──▶ loop
        │
        └── index >= total → routes.interviews.complete_interview →
            Evaluation(row) created → status=completed
```

### 2.3 Proctoring decision loop (client-side, runs every ~1.5s)

```
video frame ──▶ COCO-SSD (tfjs, 'ai' mode) / FaceDetector ('face') / none ('basic')
        │
        ▼
classifyFrame({tabVisible, personCount, faceCentered, deviceLabels})
        │
        ├─ focused      → focusedFrames++, consecutiveBad=0
        └─ distracted/no-face/multi/multi-face/phone/device/tab_hidden
                         → consecutiveBad++, warningsRef++
        │
        ▼
warnings >= MAX_WARNINGS (6)? ──Yes──▶ terminate:
        │                             stop camera, beep, logEvent →
        │                              proctoring.POST → Backend marks
        │                              status=terminated, closes WS
        │
       No ──▶ banner for 6s, heartbeat every 20s to backend
```

---

## 3. Agent layer (multi-agent orchestration)

```
┌──────────────────────────────────────────────────────────────────────┐
│              VoiceInterviewerAgent (orchestrator, per turn)           │
├──────────────────────────────────────────────────────────────────────┤
│  Groq LLM (openai/gpt-oss-20b), job context clipped to              │
│  LLM_JOB_CONTEXT_CHARS=1200 per call to stay under Groq free-tier    │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │ question_gen│  │  resume_anal │  │   answer_validator         │  │
│  │ gen tailored │  │ extract      │  │ technical/factual scoring  │  │
│  │  questions   │  │  skills/     │  │ + strengths/weaknesses     │  │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │follow_up    │  │  consistency │  │  goal_alignment            │  │
│  │single probe │  │  check       │  │  align to interview goal   │  │
│  │ per planned │  │  vs. history │  │  (only on generated q's)   │  │
│  │  question   │  │  (trims to   │  │                            │  │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  difficulty │  │   timing     │  │  knowledge_retrieval       │  │
│  │ calibrate & │  │   pacing     │  │  ChromaDB (configured,     │  │
│  │  label     │  │               │  │   not wired in at runtime) │  │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
        │
        │ fallback on every LLM failure → planned bank / rotating probes
        ▼
  guarantees: never repeat a question, bounded probing, always advances
```

---

## 4. Data model

```
┌──────────┐      ┌────────────────┐      ┌──────────┐
│  User    │ 1──N │ JobDescription │ 1──N │ Interview│
│ id, name,│      │ id, user_id*,  │      │ id,      │
│ email(!),│      │ title, descr,  │      │ user_id*,│
│ password │      │ requirements[]  │      │ job_id,  │
└──────────┘      └────────────────┘      │ cand_id, │
     │                                     │ status,  │
     │ 1──N                                  │ goal,    │
     ▼                                     │ planned_ │
┌──────────┐      ┌──────────┐             │ questions│
│Candidate │  N──1 │          │      ┌──────┘        │
│ id, name,│      │          │      │               ▼
│ email,   │      │          │      │       ┌──────────────────┐
│ resume,  │      │          │      │       │InterviewResponse │
│ skills[],│      │          │      │       │ id, interview_id,│
│ summary  │      │          │      │       │ question_text,   │
└──────────┘      │          │      │       │ candidate_response,
                  └──────────┘      │       │ audio_path,       │
                                    │       │ eval_score,       │
                                    │       │ feedback,         │
                                    │       │ behavioral_analysis,
                                    │       │ filler_count/rate,│
                                    │       │ wpm, sentiment,    │
                                    │       │ clarity, confidence│
                                    │       └────────┬───────────┘
                                    │                │ 1──1
                                    │                ▼
                                    │       ┌──────────────────┐
                                    └───────▶│   Evaluation     │
                                            │ overall/tech/comm/
                                            │  relevance,       │
                                            │ strengths[],      │
                                            │  weaknesses[],    │
                                            │  behavioral_summary,
                                            │  avg_* (filler,  │
                                            │   wpm, clarity…)  │
                                            └───────────────────┘

         ┌──────────────────┐
         │  ProctorEvent    │◀── N── 1
         │ id, interview_id,│
         │ event_type,      │
         │ detail,          │
         │ focus_score      │
         └──────────────────┘
  * nullable: rows created before auth existed have user_id=NULL and are
    hidden by every query (data isolation).
```

---

## 5. Deployment surface

| Component | Host | Key config |
|---|---|---|
| Frontend | Vercel (static, `frontend/`) | `VITE_API_URL`, `vercel.json` rewrites |
| Backend | Render (long-lived container) | `DATABASE_URL`=Neon pooled, `BACKEND_CORS_ORIGINS`, `GROQ_API_KEY`, `SECRET_KEY`, `UPLOAD_DIR` |
| DB | Neon (serverless Postgres) | pooled endpoint (WebSocket holds connection) |
| LLM/STT/TTS | Groq / Deepgram / DashScope | optional; all degrade gracefully |

**Free-tier workarounds in the code/docs:** scheduled keep-alive ping of the backend and frontend in `.github/workflows/keep-alive.yml` so Render never hits its 15-min idle sleep (sleep → 50s cold start, WS drops), in-process rate-limit note (shared store needed when scaled), WebSocket JWT noted as a future addition.
