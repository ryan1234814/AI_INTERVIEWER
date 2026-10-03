import logging
import os
from app.voice.qwen_tts import QwenTTS
from app.agents.voice_interviewer import VoiceInterviewerAgent
from app.services import question_flow

logger = logging.getLogger(__name__)


class VoiceManager:
    """Owns the TTS voice and the interviewing agent for one WebSocket session.

    Subsystem failures are isolated so that a broken TTS or LLM still leaves the
    interview able to advance through its planned questions instead of erroring
    on every turn.
    """

    def __init__(self, groq_api_key: str):
        self.groq_api_key = groq_api_key
        self.stt = None  # Browser handles STT via Web Speech API
        self.tts = None
        self.agent = None

        try:
            dashscope_key = os.getenv("DASHSCOPE_API_KEY", "")
            self.tts = QwenTTS(api_key=dashscope_key)  # Qwen3-TTS with gTTS fallback
            tts_type = "Qwen3-TTS" if self.tts.available else "gTTS (fallback)"
            logger.info(f"[VoiceManager] Initialized with {tts_type}")
        except Exception as e:
            logger.error(f"[VoiceManager] TTS init failed: {e}", exc_info=True)

        try:
            self.agent = VoiceInterviewerAgent(groq_api_key)
            logger.info(
                "[VoiceManager] Interview agent ready (model=%s)",
                os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
            )
        except Exception as e:
            # Loud on purpose: without an agent the interview runs offline.
            logger.error(
                "[VoiceManager] Interview agent init FAILED — falling back to the "
                "planned question bank: %s", e, exc_info=True
            )

    async def process_voice_input(self, audio_data: bytes, interview_context: dict) -> dict:
        """Transcribe audio using Groq Whisper STT, then run the AI agent."""
        try:
            from app.voice.stt import GroqSTT
            stt = GroqSTT(api_key=self.groq_api_key)
            transcript = await stt.transcribe_stream(audio_data)

            if not transcript:
                logger.warning("[VoiceManager] Groq STT returned empty transcript")
                transcript = "[No speech detected in audio]"

            logger.info(f"[VoiceManager] Transcribed: {transcript[:80]}")

            # Run AI agent to evaluate and generate next question
            ai_response = await self.run_agent(transcript, interview_context)
            ai_response["transcript"] = transcript
            return ai_response

        except Exception as e:
            logger.error(f"[VoiceManager] process_voice_input error: {e}", exc_info=True)
            return {"error": f"Voice processing failed: {str(e)}"}

    async def run_agent(self, transcript: str, context: dict) -> dict:
        """Run the interviewing agent, degrading to the planned bank if unavailable."""
        if self.agent is None:
            return self._offline_step(context)
        try:
            return await self.agent.conduct_interview(transcript, context)
        except Exception as e:
            logger.error(f"[VoiceManager] agent call failed: {e}", exc_info=True)
            return self._offline_step(context)

    @staticmethod
    def _offline_step(context: dict) -> dict:
        """Advance one turn without an LLM, still never repeating a question."""
        next_index = int(context.get("question_index", 0)) + 1
        question = question_flow.planned_question(
            context.get("planned_questions") or [], next_index
        ) or question_flow.rotating_probe(next_index)
        return {
            "next_question": question,
            "is_follow_up": False,
            "is_repeat": False,
            "evaluation": {
                "relevance_score": 5,
                "technical_accuracy": 5,
                "completeness": 8,
                "strengths": [],
                "inaccuracies": [],
                "feedback": "Answer recorded (AI evaluation unavailable).",
            },
        }
