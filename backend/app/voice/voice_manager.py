import logging
from app.voice.free_tts import EdgeTTS
from app.agents.voice_interviewer import VoiceInterviewerAgent

logger = logging.getLogger(__name__)

class VoiceManager:
    def __init__(self, groq_api_key: str):
        self.mock_mode = False
        try:
            self.stt = None  # Browser handles STT via Web Speech API
            self.tts = EdgeTTS()
            self.agent = VoiceInterviewerAgent(groq_api_key)
        except Exception as e:
            logger.error(f"VoiceManager init error: {e}. Falling back to mock mode.")
            self.mock_mode = True

    async def process_voice_input(self, audio_data: bytes, interview_context: dict) -> dict:
        return {"error": "STT now handled via Browser Web Speech API"}

    async def run_agent(self, transcript: str, context: dict) -> dict:
        """Run the async agent to generate next question."""
        return await self.agent.conduct_interview(transcript, context)

