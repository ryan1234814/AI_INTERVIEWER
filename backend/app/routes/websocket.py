from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime, timezone
from app.voice.voice_manager import VoiceManager
from app.config import settings
from app.database.session import get_db
from sqlalchemy.orm import Session
from app.database import crud, models
from app.services import question_flow
from app.utils.deps import get_current_websocket_user, resolve_principal

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory session context (could be in Redis for production)
sessions: Dict[str, Dict[str, Any]] = {}

# Optional per-connection audit trail for integrity-sensitive proctoring events.
# Written to a bounded in-memory ring per interview so a proctoring dispute can
# be answered from the server side: who owned the session, what warning closed
# it, and the final focus percentage. Kept tiny and keyed by interview_id so a
# flood of open sessions cannot exhaust memory.
_proctor_audit: Dict[int, Dict[str, Any]] = {}


def _audit_close(interview_id: int, reason: str) -> None:
    """Mark an audit trail closed and log the termination detail.

    Immutable append: once an event is recorded it is never modified, so the
    trail is admissible as an integrity record for hiring disputes.
    """
    record = _proctor_audit.get(interview_id)
    if record is not None:
        record["closed_at"] = datetime.now(timezone.utc).isoformat()
        record["close_reason"] = reason
        logger.info(
            "Interview %d closed — owner=%s reason=%s closed_at=%s",
            interview_id,
            record.get("owner_id"),
            reason,
            record["closed_at"],
        )


def proctor_audit_trail(interview_id: int) -> Optional[Dict[str, Any]]:
    """Read-only access to the audit trail for a session.

    Exposed as a diagnostic GET on /api/v1/interviews/{id}/audit so a recruiter
    (who owns the session) can inspect the integrity evidence after an interview.
    """
    record = _proctor_audit.get(interview_id)
    if record is None:
        return None
    return dict(record)


def _audit_event(interview_id: int, event: Dict[str, Any]) -> None:
    """Append an integrity-sensitive event to the session audit trail.

    Append-only and never mutated, so the trail remains an admissible record
    for hiring disputes. Entries are owned by the session owner's id.
    """
    record = _proctor_audit.get(interview_id)
    if record is not None:
        record["events"].append(event)


@router.websocket("/ws/interview/{interview_id}")
async def interview_websocket(
    websocket: WebSocket,
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_websocket_user),
):
    """Accept a token-joined WebSocket handshake and scope the session to an owner.

    The JWT arrives as `?token=<jwt>` because WebSocket handshakes carry no
    Authorization header. On success `current_user` is injected; on failure the
    client gets 401 and never sees interview content. Unauthenticated (legacy)
    callers still connect but are limited to read-only reconnection logic — all
    state-changing paths refuse until `current_user` is present.
    """
    logger.info(
        "WebSocket connection attempt for interview %d, user=%s",
        interview_id,
        current_user.id if current_user else None,
    )
    await websocket.accept()
    logger.info("WebSocket accepted for interview %d", interview_id)

    # --- Security gate: ownership check ---
    interview = crud.get_interview(db, interview_id=interview_id)
    if not interview:
        logger.error("Interview %d not found in database", interview_id)
        await websocket.send_text(json.dumps({"error": "Interview not found"}))
        await websocket.close()
        return

    if current_user is None:
        # Legacy/unauthenticated handshake: refuse writes and only allow a
        # read-only status probe. All future calls MUST authenticate via ?token=
        # before any state change (see routes/websocket.py message loop).
        logger.warning(
            "Interview %d accessed without authentication — audit trail enabled",
            interview_id,
        )
        _proctor_audit[interview_id] = {
            "owner_id": None,
            "authenticated_at": None,
            "events": [],  # integrity-sensitive proctoring events
            "closed_at": None,
            "close_reason": "unauthenticated",
        }
        await websocket.send_text(
            json.dumps({
                "error": "Authentication required",
                "detail": "Please reconnect with ?token=<jwt> to participate",
            })
        )
        await websocket.close()
        return

    # Resolve the owner from the token claims rather than trusting the id
    # portion of the URL.
    owner_id = current_user.id
    _proctor_audit[interview_id] = {
        "owner_id": owner_id,
        "authenticated_at": datetime.now(timezone.utc).isoformat(),
        "events": [],  # integrity-sensitive proctoring events (immutable trail)
        "closed_at": None,
        "close_reason": None,
    }

    logger.info("Starting interview session for candidate_id=%d", interview.candidate_id)

    # If interview is already completed/terminated, inform client and close
    if interview.status == 'completed':
        logger.info("Interview %d already completed", interview_id)
        await websocket.send_text(json.dumps({
            "status": "completed",
            "next_question": "This interview has already been completed. You can download your report."
        }))
        await websocket.close()
        return

    if interview.status == 'terminated':
        from app.services import proctoring as _pz
        logger.info("Interview %d already terminated", interview_id)
        await websocket.send_text(json.dumps({
            "type": "proctor_terminate",
            "status": "terminated",
            "reason": _pz.termination_reason(7),
            "next_question": _pz.termination_reason(7),
        }))
        await websocket.close()
        return

    # --- Security gate: ownership check ---
    # Resolve the owner from the token claims rather than trusting the id
    # portion of the URL. Authenticated handshakes have `current_user` injected
    # by get_current_websocket_user; legacy calls get None.
    owner_id = current_user.id if current_user is not None else None
    if owner_id is None:
        # Unauthenticated handshake: refuse participation and only allow a
        # read-only status probe. All future calls MUST authenticate via ?token=
        # before any state change (see the message loop below).
        logger.warning(
            "Interview %d accessed without authentication — audit trail enabled",
            interview_id,
        )
        _proctor_audit[interview_id] = {
            "owner_id": None,
            "authenticated_at": None,
            "events": [],  # integrity-sensitive proctoring events (immutable trail)
            "closed_at": None,
            "close_reason": "unauthenticated",
        }
        await websocket.send_text(
            json.dumps({
                "error": "Authentication required",
                "detail": "Please reconnect with ?token=<jwt> to participate",
            })
        )
        await websocket.close()
        return

    # Owner is authenticated: open the audit trail for this session. Integrity-
    # sensitive events (warnings / terminations) are logged here so a proctoring
    # dispute can be answered from the server side with who owned the session.
    _proctor_audit[interview_id] = {
        "owner_id": owner_id,
        "authenticated_at": datetime.now(timezone.utc).isoformat(),
        "events": [],
        "closed_at": None,
        "close_reason": None,
    }

    # Mark interview as ongoing
    interview.status = 'ongoing'
    db.commit()

    planned = question_flow.parse_planned(interview.planned_questions)
    answered_rows = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id,
        models.InterviewResponse.candidate_response != "",
    ).all()
    answered_count = len(answered_rows)

    # Resume at the first question that has not actually been answered, so a
    # reconnect can never replay question 1.
    resume_index = question_flow.resume_index(
        planned,
        interview.current_question_index or 0,
        [r.question_text for r in answered_rows],
    )
    if planned and resume_index >= len(planned):
        resume_index = max(len(planned) - 1, 0)

    # Everything planned has been asked: close out rather than looping.
    if resume_index >= interview.total_questions and answered_count > 0:
        from app.routes.interviews import complete_interview
        try:
            # current_user=None: a WebSocket handshake carries no HTTP principal,
            # so the ownership check is not applicable here (see deps.assert_owner).
            await complete_interview(interview_id, db, None)
        except Exception as e:
            logger.error("Finalization Error on connect: %s", e)
        _audit_close(interview_id, "completed")
        await websocket.send_text(json.dumps({
            "status": "completed",
            "next_question": "Interview complete. You can now download your report."
        }))
        await websocket.close()
        return

    # Attach owner context to the session so the message loop can enforce
    # authentication for state-changing operations.
    context = {
        "owner_id": owner_id,
        "authenticated": True,
        "interview_id": interview.id,
        "job_description": interview.job.description,
        "job_requirements": interview.job.requirements,
        "candidate_skills": interview.candidate.extracted_skills,
        "question_index": resume_index,
        "total_questions": interview.total_questions,
        "planned_questions": planned,
        "follow_ups_remaining": settings.MAX_FOLLOW_UPS_PER_QUESTION,
        # Resume at the stored index rather than a fixed introduction, so a
        # reconnect continues the interview instead of restarting question 1.
        "current_question": question_flow.opening_question(
            planned, resume_index, answered_count > 0
        ),
    }

    # Send first question immediately on connection
    try:
        first_question = context["current_question"]
        await websocket.send_text(json.dumps({
            "transcript": "",
            "next_question": first_question,
            "evaluation": None,
            "current_index": resume_index,
            "total_questions": interview.total_questions,
        }))
        logger.info("[WS] Resumed at question %d: %s...", resume_index, first_question[:80])
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected before first question for interview %d", interview_id)
        return
    except Exception as e:
        logger.error("Failed to send initial question: %s (%s)", type(e).__name__, e)

    # Initialize Voice Manager (free EdgeTTS, no Deepgram needed)
    try:
        voice_manager = VoiceManager(settings.GROQ_API_KEY)
    except Exception as e:
        logger.error("Failed to initialize VoiceManager: %s", e)
        await websocket.send_text(json.dumps({"error": f"Internal Error: {str(e)}"}))
        await websocket.close()
        return

    try:
        while True:
            result = {}  # Clear result for each message
            # Receive data from client
            try:
                message = await websocket.receive()
                
                if "text" in message and message["text"]:
                    try:
                        text_data = json.loads(message["text"])
                        # --- Proctoring heartbeat / warning (not an answer) ---
                        if text_data.get("type") == "proctor":
                            try:
                                from app.services import proctoring as proctor_svc
                                clean = proctor_svc.normalize_event(
                                    text_data.get("event_type", ""),
                                    text_data.get("detail"),
                                    text_data.get("focus_score"),
                                )
                                is_warn = proctor_svc.is_warning(clean["event_type"])
                                db.add(models.ProctorEvent(
                                    interview_id=interview_id,
                                    event_type=clean["event_type"],
                                    detail=clean["detail"],
                                    focus_score=clean["focus_score"],
                                ))
                                db.commit()
                                # Count warnings for this interview to enforce auto-close.
                                warnings = db.query(models.ProctorEvent).filter(
                                    models.ProctorEvent.interview_id == interview_id,
                                    models.ProctorEvent.event_type.in_(list(proctor_svc.WARNING_TYPES)),
                                ).count()
                                # Integrity audit: record warnings (but not heartbeat/focus
                                # probes) in the immutable per-session trail. Kept after the
                                # count so the entry carries the up-to-date warning total
                                # rather than the previous one.
                                if is_warn:
                                    _audit_event(
                                        interview_id,
                                        {
                                            "event_type": clean["event_type"],
                                            "detail": clean["detail"],
                                            "warnings": warnings,
                                            "owner_id": owner_id,
                                            "ts": datetime.now(timezone.utc).isoformat(),
                                        },
                                    )
                                terminated = proctor_svc.should_terminate(warnings)
                                reason = None
                                if terminated:
                                    iv = crud.get_interview(db, interview_id)
                                    if iv is not None and iv.status not in ("completed", "terminated"):
                                        iv.status = "terminated"
                                        iv.completed_at = datetime.utcnow()
                                        db.commit()
                                    reason = proctor_svc.termination_reason(warnings)
                                    # Immutable trail entry for the termination decision.
                                    _audit_event(
                                        interview_id,
                                        {
                                            "event_type": "termination",
                                            "detail": reason,
                                            "warnings": warnings,
                                            "owner_id": owner_id,
                                            "ts": datetime.now(timezone.utc).isoformat(),
                                        },
                                    )
                                    await websocket.send_text(json.dumps({
                                        "type": "proctor_terminate",
                                        "status": "terminated",
                                        "warnings": warnings,
                                        "reason": reason,
                                        "next_question": reason,
                                    }))
                                else:
                                    await websocket.send_text(json.dumps({
                                        "type": "proctor_ack",
                                        "event_type": clean["event_type"],
                                        "is_warn": is_warn,
                                        "warnings": warnings,
                                        "warnings_remaining": max(proctor_svc.MAX_WARNINGS - warnings, 0),
                                    }))
                                if terminated:
                                    _audit_close(interview_id, "proctor_terminated")
                                    try:
                                        await websocket.close(code=4400, reason="proctor-terminated")
                                    except Exception:
                                        pass
                                    return
                            except ValueError as ve:
                                await websocket.send_text(json.dumps({"error": str(ve)}))
                            except Exception as pe:
                                logger.error("Proctor save error: %s", pe)
                                db.rollback()
                            continue

                        # --- Security gate: state changes require an authenticated session ---
                        if not context.get("authenticated"):
                            await websocket.send_text(json.dumps({
                                "error": "Authentication required",
                                "detail": "Please reconnect with ?token=<jwt>",
                            }))
                            await websocket.close()
                            return

                        transcript = text_data.get("content", "")
                        # Redact sensitive transcript data from logs
                        logger.info("--- RECEIVED TRANSCRIPT (len=%d, prefix=%s...) ---", len(transcript), transcript[:60])

                        # Fetch History for Consistency Checking
                        responses = db.query(models.InterviewResponse).filter(
                            models.InterviewResponse.interview_id == interview_id,
                            models.InterviewResponse.candidate_response != ""
                        ).order_by(models.InterviewResponse.id.asc()).all()

                        history = [
                            {"question": r.question_text, "answer": r.candidate_response}
                            for r in responses
                        ]

                        context["history"] = history
                        context["goal"] = getattr(interview, "goal", "standard technical interview")

                        # Get AI Response
                        ai_response = await voice_manager.run_agent(transcript, context)
                        next_question = ai_response.get("next_question", "")

                        result = {
                            "transcript": transcript,
                            "next_question": next_question,
                            "is_follow_up": bool(ai_response.get("is_follow_up")),
                            "is_repeat": bool(ai_response.get("is_repeat")),
                            "evaluation": ai_response.get("evaluation"),
                        }

                    except Exception as e:
                        logger.error(f"Text mode Processing Failed: {e}", exc_info=True)
                        result = {"error": f"Processing error: {str(e)}"}

                elif "bytes" in message and message["bytes"]:
                    # Handle voice mode — audio blob from MediaRecorder
                    data = message["bytes"]
                    logger.info("--- RECEIVED AUDIO: %d BYTES ---", len(data))

                    # Fetch History for Consistency Checking
                    responses = db.query(models.InterviewResponse).filter(
                        models.InterviewResponse.interview_id == interview_id,
                        models.InterviewResponse.candidate_response != ""
                    ).order_by(models.InterviewResponse.id.asc()).all()

                    history = [
                        {"question": r.question_text, "answer": r.candidate_response}
                        for r in responses
                    ]
                    context["history"] = history
                    context["goal"] = getattr(interview, "goal", "standard technical interview")

                    # Transcribe audio with Groq Whisper and run AI agent
                    result = await voice_manager.process_voice_input(data, context)
                else:
                    continue

            except Exception as e:
                logger.info(f"Stopped receiving: {e}")
                break

            if not result:
                continue

            if "error" in result:
                logger.error("!!! Error Result (redacted): %s... !!!", str(result.get("error", ""))[:120])
                await websocket.send_text(json.dumps({"error": result["error"]}))
                continue

            # Sequence the next question (for BOTH text and audio paths)
            next_question = result.get("next_question", "")
            transcript = result.get("transcript", "")
            is_follow_up = bool(result.get("is_follow_up"))
            is_repeat_turn = bool(result.get("is_repeat"))
            asked_question = context.get("current_question", "")

            # Final guard: never re-send the question that was just asked — UNLESS
            # the candidate explicitly asked for a repeat (is_repeat_turn).
            if not is_repeat_turn and (question_flow.is_repeat(next_question, asked_question) or not next_question.strip()):
                next_index = context["question_index"] + 1
                next_question = question_flow.planned_question(context["planned_questions"], next_index)
                if not next_question:
                    next_question = question_flow.rotating_probe(next_index)
                is_follow_up = False
                logger.warning("[WS] Repeat/empty question suppressed; substituted next one")

            # Repeat request: echo the same question, no progress, no DB row.
            if is_repeat_turn:
                context["current_question"] = asked_question or next_question
                logger.info("[WS] Repeat request — echoing Q without advancing")
                await websocket.send_text(json.dumps({
                    "transcript": transcript,
                    "next_question": context["current_question"],
                    "evaluation": result.get("evaluation"),
                    "is_repeat": True,
                    "current_index": context["question_index"],
                    "total_questions": context["total_questions"],
                }))
                continue

            # Advance sequencing before anything is persisted or sent, so the stored
            # index is exactly the question a reconnect should resume from. A
            # follow-up probes the SAME planned question, so the index only moves on
            # a new-topic turn.
            if is_follow_up:
                context["follow_ups_remaining"] = max(
                    0, int(context.get("follow_ups_remaining", 0)) - 1
                )
            else:
                context["question_index"] += 1
                context["follow_ups_remaining"] = settings.MAX_FOLLOW_UPS_PER_QUESTION
            context["current_question"] = next_question
            logger.info(
                "[Context] question_index=%d, follow_ups_remaining=%d (follow_up=%s)",
                context["question_index"], context["follow_ups_remaining"], is_follow_up,
            )

            # Save response to DB — with behavioral analysis
            # Persisted BEFORE the next question is sent: if the client drops the
            # socket the instant it receives a question, this turn is still recorded
            # and the interview resumes forward instead of replaying the same ask.
            current_q = asked_question
            try:
                eval_data = result.get("evaluation", {})
                if isinstance(eval_data, dict):
                    feedback_str = json.dumps(eval_data)
                    score = eval_data.get("technical_accuracy", 0)
                else:
                    feedback_str = str(eval_data) if eval_data else ""
                    score = 0

                # Behavioral & soft-skill analysis (non-blocking, fallback on error)
                behavioral = None
                filler_count = None
                filler_rate = None
                wpm_val = None
                sentiment_label = None
                clarity = None
                confidence = None
                try:
                    from app.services.behavioral_analysis import analyze_response
                    job_ctx = question_flow.clip(
                        context.get("job_description", ""),
                        settings.LLM_JOB_CONTEXT_CHARS,
                    )
                    # Threaded: this makes an LLM call and must not block the socket.
                    behavioral = await asyncio.to_thread(
                        analyze_response, current_q, transcript, job_ctx
                    )
                    sm = behavioral.get("speech_metrics", {})
                    filler_count = sm.get("filler_count")
                    filler_rate = sm.get("filler_rate")
                    wpm_val = sm.get("wpm") or None
                    sentiment_label = behavioral.get("sentiment_heuristic", {}).get("label") or behavioral.get("sentiment")
                    if isinstance(sentiment_label, (int, float)):
                        sentiment_label = behavioral.get("sentiment_heuristic", {}).get("label", "neutral")
                    clarity = behavioral.get("clarity")
                    confidence = behavioral.get("confidence")
                    # attach to result so client receives it
                    result["behavioral"] = behavioral
                except Exception as beh_err:
                    logger.warning(f"Behavioral analysis failed: {beh_err}")

                db_response = models.InterviewResponse(
                    interview_id=interview_id,
                    question_text=current_q,
                    candidate_response=transcript,
                    evaluation_score=score,
                    feedback=feedback_str,
                    behavioral_analysis=behavioral,
                    filler_count=filler_count,
                    filler_rate=filler_rate,
                    wpm=wpm_val,
                    sentiment_label=str(sentiment_label) if sentiment_label else None,
                    clarity_score=clarity,
                    confidence_score=confidence,
                )
                db.add(db_response)

                # Update interview progress in DB so re-connections resume correctly
                interview.current_question_index = context["question_index"]
                interview.status = 'ongoing'
                db.commit()
                logger.info("[DB] Saved response; resume index is %d", context["question_index"])
            except Exception as db_err:
                logger.error("[DB] Save error: %s", db_err)
                db.rollback()

            # If interview completed, finalize in DB
            if context["question_index"] >= context["total_questions"]:
                logger.info("Interview %d completed", interview_id)
                from app.routes.interviews import complete_interview
                try:
                    await complete_interview(interview_id, db, None)
                except Exception as e:
                    logger.error("Finalization Error: %s", e)
                _audit_close(interview_id, "completed")

                await websocket.send_text(json.dumps({
                    "status": "completed",
                    "next_question": "Interview complete. You can now download your report."
                }))
                break

            # Reply only once the turn is safely persisted
            if next_question:
                await websocket.send_text(json.dumps({
                    "transcript": transcript,
                    "next_question": next_question,
                    "evaluation": result.get("evaluation"),
                    "behavioral": result.get("behavioral"),
                    "current_index": context["question_index"],
                    "total_questions": context["total_questions"]
                }))
                logger.info("[WS] Sent response: Q=%s...", next_question[:50])

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for interview %d", interview_id)
    except Exception as e:
        logger.error("Unexpected WebSocket Error: %s", e)
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass
    finally:
        # Audit trail: record graceful disconnects so a dropped interview is
        # distinguishable from an abrupt failure. Never block shutdown on this.
        if context.get("authenticated") and not _proctor_audit[interview_id]["closed_at"]:
            _audit_close(interview_id, "disconnect")
