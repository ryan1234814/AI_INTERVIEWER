import logging
import os
from app.voice.qwen_tts import QwenTTS
from app.agents.voice_interviewer import VoiceInterviewerAgent

logger = logging.getLogger(__name__)

class VoiceManager:
    def __init__(self, groq_api_key: str):
        self.mock_mode = False
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
        return {"error": "STT now handled via Browser Web Speech API"}

    async def run_agent(self, transcript: str, context: dict) -> dict:
        """Run the async agent to generate next question."""
        return await self.agent.conduct_interview(transcript, context)

