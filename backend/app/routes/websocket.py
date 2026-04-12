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
    
    # Initialize Voice Manager
    try:
        voice_manager = VoiceManager(settings.GROQ_API_KEY, settings.DEEPGRAM_API_KEY)
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

                        # 1. Get AI Response
                        ai_response = await voice_manager.agent.conduct_interview(transcript, context)
                        next_question = ai_response.get("next_question", "")
                        
                        # 2. Generate FREE Voice for the next question
                        audio_response = None
                        if next_question:
                            audio_response = await voice_manager.tts.get_audio_stream(next_question)
                            
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
            
            # Send response back to client
            # 1. Send Transcript and text response
            await websocket.send_text(json.dumps({
                "transcript": result["transcript"],
                "next_question": result["next_question"],
                "evaluation": result["evaluation"]
            }))
            
            # 2. Send Audio Response
            if result.get("audio_response"):
                logger.info("Sending audio response back to client")
                await websocket.send_bytes(result["audio_response"])

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
