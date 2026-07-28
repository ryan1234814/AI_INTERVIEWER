from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import Dict, Any
import json
import logging
from app.voice.voice_manager import VoiceManager
from app.config import settings
from app.database.session import get_db
from sqlalchemy.orm import Session
from app.database import crud, models

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

    # If interview is already completed, inform client and close
    if interview.status == 'completed':
        logger.info("Interview %d already completed", interview_id)
        await websocket.send_text(json.dumps({
            "status": "completed",
            "next_question": "This interview has already been completed. You can download your report."
        }))
        await websocket.close()
        return

    # Mark interview as ongoing
    interview.status = 'ongoing'
    db.commit()

    context = {
        "interview_id": interview.id,
        "job_description": interview.job.description,
        "job_requirements": interview.job.requirements,
        "candidate_skills": interview.candidate.extracted_skills,
        "question_index": interview.current_question_index,
        "total_questions": interview.total_questions,
        "current_question": "Please introduce yourself and tell me about your background."
    }

    # Send first question immediately on connection
    try:
        first_question = context["current_question"]
        await websocket.send_text(json.dumps({
            "transcript": "",
            "next_question": first_question,
            "evaluation": None
        }))
        logger.info("[WS] Sent initial question (truncated): %s...", first_question[:80])
    except Exception as e:
        logger.error("Failed to send initial question: %s", e)

    try:
        while True:
            result = {}  # Clear result for each message
            # Receive data from client
            try:
                message = await websocket.receive()
                
                if "text" in message and message["text"]:
                    try:
                        text_data = json.loads(message["text"])
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

            # Send response back to client (for BOTH text and audio paths)
            next_question = result.get("next_question", "")
            transcript = result.get("transcript", "")
            if next_question:
                await websocket.send_text(json.dumps({
                    "transcript": transcript,
                    "next_question": next_question,
                    "evaluation": result.get("evaluation")
                }))
                logger.info("[WS] Sent response: Q=%s...", next_question[:50])

            # Save response to DB
            current_q = context.get("current_question", "")
            try:
                eval_data = result.get("evaluation", {})
                # Serialize evaluation as JSON for the feedback field
                if isinstance(eval_data, dict):
                    feedback_str = json.dumps(eval_data)
                    score = eval_data.get("technical_accuracy", 0)
                else:
                    feedback_str = str(eval_data) if eval_data else ""
                    score = 0

                db_response = models.InterviewResponse(
                    interview_id=interview_id,
                    question_text=current_q,
                    candidate_response=transcript,
                    evaluation_score=score,
                    feedback=feedback_str
                )
                db.add(db_response)

                # Update interview progress in DB so re-connections resume correctly
                interview.current_question_index = context["question_index"] + 1
                interview.status = 'ongoing'
                db.commit()
                logger.info("[DB] Saved response for question index %d", context["question_index"])
            except Exception as db_err:
                logger.error("[DB] Save error: %s", db_err)
                db.rollback()

            # Update context for next round
            context["question_index"] += 1
            context["current_question"] = next_question
            logger.info("[Context] Updated to question %d", context["question_index"])

            # If interview completed, finalize in DB
            if context["question_index"] >= context["total_questions"]:
                logger.info("Interview %d completed", interview_id)
                from app.routes.interviews import complete_interview
                try:
                    await complete_interview(interview_id, db)
                except Exception as e:
                    logger.error("Finalization Error: %s", e)
                
                await websocket.send_text(json.dumps({
                    "status": "completed",
                    "next_question": "Interview complete. You can now download your report."
                }))
                break

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
