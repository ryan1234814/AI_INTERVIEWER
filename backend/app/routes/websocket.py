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
    logger.info(f"WebSocket connection attempt for interview {interview_id}")
    await websocket.accept()
    logger.info(f"WebSocket accepted for interview {interview_id}")
    
    # Initialize Voice Manager (free EdgeTTS, no Deepgram needed)
    try:
        voice_manager = VoiceManager(settings.GROQ_API_KEY)
    except Exception as e:
        logger.error(f"Failed to initialize VoiceManager: {e}")
        await websocket.send_text(json.dumps({"error": f"Internal Error: {str(e)}"}))
        await websocket.close()
        return

    # Fetch interview details from DB
    interview = crud.get_interview(db, interview_id=interview_id)
    if not interview:
        logger.error(f"Interview {interview_id} not found in database")
        await websocket.send_text(json.dumps({"error": "Interview not found"}))
        await websocket.close()
        return

    logger.info(f"Starting interview session for {interview.candidate.name}")

    context = {
        "interview_id": interview.id,
        "job_description": interview.job.description,
        "job_requirements": interview.job.requirements,
        "candidate_skills": interview.candidate.extracted_skills,
        "question_index": interview.current_question_index,
        "total_questions": interview.total_questions,
        "current_question": "Please introduce yourself." # Default first question
    }

    try:
        while True:
            result = {} # Clear result for each message
            # Receive data from client
            try:
                # receive() returns a dict with 'text' or 'bytes' keys
                message = await websocket.receive()
                
                if "text" in message and message["text"]:
                    try:
                        text_data = json.loads(message["text"])
                        transcript = text_data.get("content", "")
                        logger.info(f"--- RECEIVED TRANSCRIPT: {transcript} ---")
                        
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

                        # 1. Get AI Response (non-blocking)
                        ai_response = await voice_manager.run_agent(transcript, context)
                        next_question = ai_response.get("next_question", "")
                        
                        # 2. Generate FREE Voice for the next question
                        audio_response = None
                        if next_question:
                            try:
                                audio_response = await voice_manager.tts.get_audio_stream(next_question)
                                logger.info(f"Generated {len(audio_response)} bytes of audio")
                            except Exception as tts_err:
                                logger.error(f"TTS generation failed: {tts_err}")
                                audio_response = None
                            
                        result = {
                            "transcript": transcript,
                            "next_question": next_question,
                            "evaluation": ai_response.get("evaluation"),
                            "audio_response": audio_response
                        }
                    except Exception as e:
                        logger.error(f"Text mode Processing Failed: {e}")
                        result = {"error": f"Internal Error: {str(e)}"}
                        
                elif "bytes" in message and message["bytes"]:
                    # Handle voice mode
                    data = message["bytes"]
                    logger.info(f"--- RECEIVED AUDIO: {len(data)} BYTES ---")
                    result = await voice_manager.process_voice_input(data, context)
                else:
                    continue
                    
            except Exception as e:
                logger.info(f"Stopped receiving: {e}")
                break

            if not result:
                continue
            
            if "error" in result:
                logger.error(f"!!! Error Result: {result['error']} !!!")
                await websocket.send_text(json.dumps({"error": result["error"]}))
                continue

            # Update context for next round
            context["question_index"] += 1
            context["current_question"] = result["next_question"]

            # Save response to DB
            try:
                eval_data = result.get("evaluation", {})
                db_response = models.InterviewResponse(
                    interview_id=interview_id,
                    question_text=context.get("current_question", ""),
                    candidate_response=result.get("transcript", ""),
                    evaluation_score=eval_data.get("technical_accuracy", 0) if isinstance(eval_data, dict) else 0,
                    feedback=eval_data.get("feedback", "") if isinstance(eval_data, dict) else str(eval_data)
                )
                db.add(db_response)
                db.commit()
            except Exception as db_err:
                logger.error(f"DB save error: {db_err}")
                db.rollback()

            # Send response back to client
            # 1. Send Audio first (so it arrives before or with the text)
            if result.get("audio_response"):
                logger.info(f"Sending {len(result['audio_response'])} bytes of audio to client")
                await websocket.send_bytes(result["audio_response"])

            # 2. Send Transcript and text response
            await websocket.send_text(json.dumps({
                "transcript": result["transcript"],
                "next_question": result["next_question"],
                "evaluation": result["evaluation"]
            }))

            # If interview completed, finalize in DB
            if context["question_index"] >= context["total_questions"]:
                logger.info(f"Interview {interview_id} completed")
                # Final evaluation and DB update
                from app.routes.interviews import complete_interview
                try:
                    await complete_interview(interview_id, db)
                except Exception as e:
                    logger.error(f"Finalization Error: {e}")
                
                await websocket.send_text(json.dumps({
                    "status": "completed",
                    "next_question": "Interview complete. You can now download your report."
                }))
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for interview {interview_id}")
    except Exception as e:
        logger.error(f"Unexpected WebSocket Error: {e}")
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        # Cleanup
        pass
