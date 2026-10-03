from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, Any
import asyncio
import json
import logging
from app.voice.voice_manager import VoiceManager
from app.config import settings
from app.database.session import get_db
from sqlalchemy.orm import Session
from app.database import crud, models
from app.services import question_flow

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory session context (could be in Redis for production)
sessions: Dict[str, Dict[str, Any]] = {}

@router.websocket("/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: int, db: Session = Depends(get_db)):
    logger.info("WebSocket connection attempt for interview %d", interview_id)
    await websocket.accept()
    logger.info("WebSocket accepted for interview %d", interview_id)
    
    # Initialize Voice Manager (free EdgeTTS, no Deepgram needed)
    try:
        voice_manager = VoiceManager(settings.GROQ_API_KEY)
    except Exception as e:
        logger.error("Failed to initialize VoiceManager: %s", e)
        await websocket.send_text(json.dumps({"error": f"Internal Error: {str(e)}"}))
        await websocket.close()
        return

    # Fetch interview details from DB
    interview = crud.get_interview(db, interview_id=interview_id)
    if not interview:
        logger.error("Interview %d not found in database", interview_id)
        await websocket.send_text(json.dumps({"error": "Interview not found"}))
        await websocket.close()
        return

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
        await websocket.send_text(json.dumps({
            "status": "completed",
            "next_question": "Interview complete. You can now download your report."
        }))
        await websocket.close()
        return

    context = {
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
                                from datetime import datetime
                                clean = proctor_svc.normalize_event(
                                    text_data.get("event_type", ""),
                                    text_data.get("detail"),
                                    text_data.get("focus_score"),
                                )
                                db.add(models.ProctorEvent(
                                    interview_id=interview_id,
                                    event_type=clean["event_type"],
                                    detail=clean["detail"],
                                    focus_score=clean["focus_score"],
                                ))
                                db.commit()
                                is_warn = proctor_svc.is_warning(clean["event_type"])
                                # Count warnings for this interview to enforce auto-close.
                                warnings = db.query(models.ProctorEvent).filter(
                                    models.ProctorEvent.interview_id == interview_id,
                                    models.ProctorEvent.event_type.in_(list(proctor_svc.WARNING_TYPES)),
                                ).count()
                                terminated = proctor_svc.should_terminate(warnings)
                                reason = None
                                if terminated:
                                    iv = crud.get_interview(db, interview_id)
                                    if iv is not None and iv.status not in ("completed", "terminated"):
                                        iv.status = "terminated"
                                        iv.completed_at = datetime.utcnow()
                                        db.commit()
                                    reason = proctor_svc.termination_reason(warnings)
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
                                        "is_warning": is_warn,
                                        "warnings": warnings,
                                        "warnings_remaining": max(proctor_svc.MAX_WARNINGS - warnings, 0),
                                    }))
                                if terminated:
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
        # Cleanup
        pass
