import logging
from app.voice.free_tts import EdgeTTS
from app.agents.voice_interviewer import VoiceInterviewerAgent

logger = logging.getLogger(__name__)

class VoiceManager:
    def __init__(self, groq_api_key: str, deepgram_api_key: str):
        self.mock_mode = False
        try:
            # We no longer need NVIDIA or Deepgram for STT/TTS in this free setup
            self.stt = None # Browser handles STT
            self.tts = EdgeTTS()
            self.agent = VoiceInterviewerAgent(groq_api_key)
        except Exception as e:
            logger.error(f"VoiceManager init error: {e}. Falling back to mock mode.")
            self.mock_mode = True

    async def process_voice_input(self, audio_data: bytes, interview_context: dict) -> dict:
        # NOTE: This method is now handled via the text transport in websocket.py 
        # for Browser-native free STT. Kept for backwards compatibility if needed.
        return {"error": "STT now handled via Browser Web Speech API"}

