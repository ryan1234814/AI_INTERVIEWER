# Security Pipeline — Agentic AI Voice Interview Platform

Designed for this repo. Each stage maps to existing code locations so the diagram doubles as a security checklist you can audit against the source.

---

## End-to-end security pipeline

```
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  PHASE 1 — INPUT ACCEPTANCE (before anything is trusted)                          │
 └──────────────────────────────────────────────────────────────────────────────────┘

          RECRUITER              CANDIDATE              EXTERNAL APIs
            │                      │                        │
            │ signup/login         │ voice audio            │ Groq Whisper /
            │ + SECRET_KEY JWT     │ + resume PDF           │ LLM / TTS /
            │ (Auth routes)        │ (InterviewSetup)       │ Deepgram /
            │                      │                        │ DashScope
            │                      │                        ▼
            ▼                      ▼                 ┌───────────────┐
     ┌──────────────┐       ┌──────────────┐      │  STRANGER      │  (untrusted 3rd-
     │  rate_limit  │       │  file        │      │  THING         │   party API)
     │  sliding     │       │  validator   │      └───────┬───────┘
     │  window /IP  │       └───────┬──────┘              │
     └──────┬───────┘               │                     │
            │                       │  1. size cap        │  2.
            │                       │  2. magic bytes     │     prompt-injection
            ▼                       ▼                     │     guardrails
  ┌─────────────────┐     ┌─────────────────┐            ▼
  │   auth layer    │     │  upload guard   │     ┌───────────────────┐
  │ - password hash │     │ - reject exe/  │     │   AGENT PROMPT    │
  │   (passlib) +   │     │   zip/bom/     │     │   SANDBOXING      │
  │   BCrypt        │     │   oversized    │     └───────────┬───────┘
  │ - slow verify   │     │ - pdfplumber   │                │
  │   on login      │     │   (no shell)   │                ▼
  └─────────┬───────┘     └────────┬──────┘     ┌───────────────────┐
            │                      │            │  GROQ LLM / STT   │
            ▼                      ▼            │  free-tier        │
            ▼                      ▼            │  budget (chars/   │
   ┌───────────────────────────────────────────────────────────────┐
   │  PHASE 2 — AUTHENTICATION & SESSIONS                          │
   └───────────────────────────────────────────────────────────────┘
            │
            │ Bearer token on every request
            ▼
   ┌─────────────────┐
   │   jwt.decode    │  HS256, 30 min expiry
   │ + email match   │
   │   (normalize)   │
   └────────┬────────┘
            │ valid? ───No──▶ 401 (clear token, client redirect — not a
            │                  full page reload, so a live interview UI
            │                  does not get wiped mid-session)
            │ Yes
            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  PHASE 3 — AUTHORIZATION (every route)                          │
   └─────────────────────────────────────────────────────────────────┘
            │
            │ resolve_principal() → get_current_user()
            │  (WebSocket path: current_user=None; auth via ?token= —
            │   recommended improvement, see "Gaps")
            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │      assert_owner(resource.user_id, current_user.id)           │
   │   ALL routes: auth / jobs / candidates / interviews /          │
   │   proctoring — filters by user_id at the DB query level        │
   └──────────────┬──────────────────────────┬───────────────────────┘
                  │                           │
      user's own rows ◀────────────▶ NULL rows
      (always shown)                 (pre-auth, never visible)
                  │                           │
                  └───────────┬───────────────┘
                              ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  PHASE 4 — DATA HANDLING (trusted internal path)                │
   └─────────────────────────────────────────────────────────────────┘
            │
            ├─ uploads/  (resume PDFs, audio blobs)
            │   - path sanitized (candidate_name.replace(' ','_'))
            │   - prod: UPLOAD_DIR → Persistent Disk so redeploy
            │     doesn't nuke evidence (and resumes)
            │
            ├─ database/  (SQLAlchemy ORM + CRUD)
            │   - ORM = no raw SQL concat; no injection surface
            │   - pool_pre_ping + pool_recycle (Neon idle-compute
            │     wakes the pooler from killing the held connection)
            │
            ├─ agents/  (LangChain / Groq agent calls)
            │   - context clipped to LLM_JOB_CONTEXT_CHARS=1200
            │     per call → keeps Groq free-tier tokens/min, reduces
            │     429 storms that force every agent onto fallback
            │   - history trimmed to LLM_HISTORY_TURNS=4 (context
            │     hygiene + privacy: least-answer retention)
            │   - every LLM/STT/TTS call wrapped → structured fallback
            │     (planned bank / rotating probes / default eval)
            │
            ├─ voice/  (TTS / STT)
            │   - Qwen3-TTS → gTTS/Edge-TTS fallback
            │   - STT: Groq Whisper → Deepgram → browser Web Speech API
            │   - empty transcript → "[No speech detected]" sentinel,
            │     never crashes the loop
            │
            └─ services/proctoring.py  (client-reported events)
                - allowlist of event_type (frozenset) — unknown types
                  rejected at the WS layer with ValueError → 400
                - clamp_focus(0–100), NaN guard, detail capped @1000 chars
                - MAX_WARNINGS=6 policy, termination_reason() template
                - pure logic module: ZERO CV dependencies on the server
                  (CV runs only in browser tfjs)
   ┌─────────────────────────────────────────────────────────────────┐
   │  PHASE 5 — OUTPUT (before it leaves the server)                 │
   └─────────────────────────────────────────────────────────────────┘
            │
            ├─ JSON API responses  → Pydantic validation on models/schemas
            │   (consistent serialization, no leaking internals)
            │
            ├─ PDF report  (routes/interviews.report + reportlab)
            │   - only rows the owner can already query (owner check
            │     first; evaluation required; candidate/job fetched
            │     via same-scoped queries)
            │   - proctor_summary embedded (integrity trail)
            │
            ├─ CORS  (app/main.py + app/config.py)
            │   - exact-origin allowlist, no trailing slash, no path,
            │     no wildcard; parse both CSV and JSON; log if empty
            │   - credentials included; / returns 200 even when CORS
            │     denies → never leaks whether the API "exists"
            │
            ├─ WebSockets  (routes/websocket.py)
            │   - closed on completed/terminated
            │   - proctor terminate → WS 4400 "proctor-terminated"
            │   - heartbeat thinning on analytics (bounded timeline,
            │     heartbeats sampled ::10) to resist log-volume abuse
            │
            └─ frontend static (Vercel)
                - tfjs / coco-ssd wasm only loaded from the trusted
                  build bundle
                - proctor events POSTed to the same-origin API
   ┌─────────────────────────────────────────────────────────────────┐
   │  PHASE 6 — OBSERVABILITY & RECOVERY                             │
   └─────────────────────────────────────────────────────────────────┘
            │
            ├─ logging (structured, levels)
            │   - auth failures, proctor events, LLM fallbacks,
            │     DB errors, schema migrations
            │   - transcripts redacted in logs to [:60] prefix
            │   - secrets never logged
            │
            ├─ error handling
            │   - no traceback leakage to clients (500 with generic
            │     detail; full stack to logs only)
            │   - db.rollback() on every DB error path
            │
            ├─ backup / persistence
            │   - Postgres (Neon) → native snapshots/backups
            │   - uploads → Persistent Disk on Render starter+
            │
            └─ incident response hooks (to add)
                - API key rotation runbooks (GROQ / Deepgram /
                  DashScope / SECRET_KEY)
                - key leakage procedure (revoke + rotate + invalidate
                  all JWTs by changing SECRET_KEY)
```

---

## Data-flow security boundary

```
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│              UNTRUSTED ZONE                  │  │              TRUSTED ZONE                    │
│                                              │  │                                              │
│   Candidate browser (mic/webcam)             │  │   Render backend (FastAPI)                   │
│   · Web Speech API / MediaRecorder           │  │   · auth · authorization · agents            │
│   · client-side proctoring tfjs              │  │   · SQLAlchemy ORM (no raw SQL)              │
│   · localStorage with JWT                    │  │   · proctoring policy (allowed list)         │
│                                              │  │   · reportlab PDF                          │
│        ↓  transcript / audio / events         │  │                                              │
│        ──────────────────────────────────────▶│  │   ┌──────────────────────────────────┐       │
│                                              │  │   │        DATABASE                │       │
│   ┌────────────────────────────────┐          │  │   │  PostgreSQL (Neon pooled)      │       │
│   │  client reports "I spoke"     │          │  │   │   - users, jobs, candidates     │       │
│   └────────────────────────────────┘          │  │   │   - interviews, responses       │       │
│         (never trust the transcript text)     │  │   │   - evaluations, proctor_events │       │
│                                              │  │   └─────────────┬────────────────────┘       │
│   ┌────────────────────────────────┐          │  │                 │                       │
│   │  browser sees COCO-SSD frames  │          │  │                 │                       │
│   │  (face/device detection)       │          │  │                 ▼                       │
│   │  → NEVER sent to server        │          │  │   ┌──────────────────────────────────┐       │
│   └────────────────────────────────┘          │  │   │         FILESYSTEM               │       │
│                                              │  │   │   - uploads/ (resume PDFs)     │       │
│   server only receives:                      │  │   │   - backend/uploads/ (dev)       │       │
│   · JSON transcript (validated)              │  │   │   - chroma_db/ (unused, optional)│       │
│   · normalized proctor event (allowlisted)   │  │   └──────────────────────────────────┘       │
│   · audio bytes only in voice mode           │  │                                              │
│                                              │  │   ┌──────────────────────────────────┐       │
│                                              │  │   │         EXTERNAL APIs            │       │
│                                              │  │   │   - Groq (LLM + Whisper STT)     │       │
│                                              │  │   │   - Deepgram / DashScope / Nivida│       │
│                                              │  │   └──────────────────────────────────┘       │
└──────────────────────────────────────────────┘  └──────────────────────────────────────────────┘

  Boundary rules:
    1. Nothing leaves the browser except: transcript text, JSON event objects, audio (voice mode).
    2. All CV/face/device inference is CLIENT-ONLY; the server can never see frames.
    3. Server-side policy (proctoring.py) is the source of truth for warnings/termination.
    4. Every resource query is owner-filtered; NULL owner rows are permanently invisible.
```

---

## Threat coverage matrix (what this pipeline actually stops)

| Threat | Where it's handled | Code location |
|---|---|---|
| Brute-force on login/signup | Rate limiting per IP (+ email) | `app/utils/rate_limit.py` |
| Credential stuffing via fast verify | BCrypt + slow verify on login | `app/utils/security.py` |
| JWT theft / session hijack | Bearer token + expiry; 401 clears token | `app/utils/deps.py`, `frontend/services/api.ts` |
| IDOR / cross-tenant interview access | `assert_owner` on ALL routes | `app/utils/deps.py`, all route files |
| Pre-auth data leakage | `user_id` filter + NULL-row invisibility | `app/database/models.py`, `_ensure_schema()` |
| Malicious file upload | Size/magic-byte cap, pdfplumber-only PDF read | `routes/interviews.py` (setup), `voice/deps.py` |
| SQL injection | ORM-only queries, no string concat | `app/database/*`, all CRUD |
| Prompt injection via resume / transcript / job desc | Agent fallback paths; context clipped | `agents/*`, `app/config.py` |
| LLM token-budget abuse → service disruption | `LLM_JOB_CONTEXT_CHARS`, `LLM_HISTORY_TURNS` | `app/config.py` |
| Unbounded follow-up loop | `MAX_FOLLOW_UPS_PER_QUESTION=1` | `agents/voice_interviewer.py` |
| Question-repeat loop (candidate trapped on Q1) | repeat guards at 3 layers | `services/question_flow.py`, `agents/*`, `routes/websocket.py` |
| Resume/behavioral data leakage in PDF | owner check before PDF generation | `routes/interviews.py` `/report` |
| CORS misconfiguration → open API | exact-origin list, slash-stripped, empty-list warning | `app/config.py`, `app/main.py` |
| Proctor event forgery (client faking warnings) | allowlist + clamp + cap + backend is source of truth | `routes/websocket.py`, `services/proctoring.py` |
| Heartbeat flood / log volume abuse | heartbeats sampled ::10 in analytics | `routes/interviews.py` `/analytics` |
| Exposed tracebacks / secrets in responses | try/except per layer, traceback to logs only | throughout |
| Resume loss on deploy | Persistent Disk + `UPLOAD_DIR` env | `routes/interviews.py` top, `setup.md` 4.5 |
| WebSocket held-connection kills serverless DB | pooled Neon endpoint, `pool_pre_ping`/`recycle` | `app/database/session.py` |

---

## Open gaps (recommended next steps)

1. **WebSocket authentication** — currently `?token=` is commented as a TODO (`routes/websocket.py` line ~92). Until implemented, anyone with a guessed `interview_id` can drive a session. Add JWT decode in `interview_websocket()` before accepting audio.
2. **Audit log for proctoring decisions** — the termination reason and warning count are logged, but add an immutable integrity trail entry (signed/hashed) if proctoring evidence may be contested in hiring disputes.
3. **Key rotation runbook** — document how to revoke all sessions instantly (change `SECRET_KEY`) and per-provider key rotation (Groq/Deepgram/DashScope) without an outage.
4. **Backups + restore test** — Neon native backups are on; verify the PDF-report path and `uploads/` can be restored end-to-end.
5. **Client-side CSP** — add a Content-Security-Policy header to FastAPI so the tfjs wasm and MediaRecorder APIs can only come from trusted origins (blocks a compromised CDN from injecting a proctoring script).

---

## How to use this diagram

- **Onboarding:** map each colored phase to the actual file paths so new contributors know where their change touches security boundaries.
- **PR review:** any PR touching `routes/`, `agents/`, `voice/`, or `database/` is reviewed against the matching phase/gap line above.
- **Compliance:** the `Threat coverage matrix` doubles as evidence for "inputs are validated, authorization is enforced per-record, outputs are scoped" requirements.
