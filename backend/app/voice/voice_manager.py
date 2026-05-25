import logging
import os
from app.voice.qwen_tts import QwenTTS
from app.agents.voice_interviewer import VoiceInterviewerAgent

logger = logging.getLogger(__name__)

class VoiceManager:
    def __init__(self, groq_api_key: str):
        self.mock_mode = False
        self.groq_api_key = groq_api_key
        try:
            self.stt = None  # Browser handles STT via Web Speech API
            dashscope_key = os.getenv("DASHSCOPE_API_KEY", "")
            self.tts = QwenTTS(api_key=dashscope_key)  # Qwen3-TTS with gTTS fallback
            self.agent = VoiceInterviewerAgent(groq_api_key)
            tts_type = "Qwen3-TTS" if self.tts.available else "gTTS (fallback)"
            logger.info(f"[VoiceManager] Initialized with {tts_type}")
        except Exception as e:
            logger.error(f"VoiceManager init error: {e}. Falling back to mock mode.")
            self.mock_mode = True

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
            ai_response = await self.agent.conduct_interview(transcript, interview_context)
            ai_response["transcript"] = transcript
            return ai_response

        except Exception as e:
            logger.error(f"[VoiceManager] process_voice_input error: {e}", exc_info=True)
            return {"error": f"Voice processing failed: {str(e)}"}

    async def run_agent(self, transcript: str, context: dict) -> dict:
        """Run the async agent to generate next question."""
        return await self.agent.conduct_interview(transcript, context)
