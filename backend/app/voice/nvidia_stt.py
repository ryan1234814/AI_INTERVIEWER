import requests
import logging
import asyncio
import base64
from app.config import settings

logger = logging.getLogger(__name__)

class NvidiaSTT:
    def __init__(self, api_key: str = settings.NVIDIA_API_KEY):
        self.api_key = api_key
        # Standard Public Cloud URL
        self.invoke_url = "https://ai.api.nvidia.com/v1/audio/transcriptions"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def transcribe_stream(self, audio_buffer: bytes) -> str:
        try:
            logger.info(f"--- NVIDIA WHISPER: Attempting transcription ({len(audio_buffer)} bytes) ---")
            
            asset_b64 = base64.b64encode(audio_buffer).decode("utf-8")
            
            def call_nvidia():
                # Some NIMs prefer this structure
                payload = {
                    "audio": asset_b64,
                    "model": "openai/whisper-large-v3",
                    "language": "en",
                    "response_format": "json",
                }
                # Fallback URL attempt if first fails might be needed, but let's try this first
                response = requests.post(self.invoke_url, headers=self.headers, json=payload)
                if response.status_code != 200:
                    logger.error(f"NVIDIA API Error {response.status_code}: {response.text}")
                response.raise_for_status()
                return response.json()

            response_json = await asyncio.to_thread(call_nvidia)
            transcript = response_json.get("text", "")
            
            logger.info(f"--- NVIDIA TRANSCRIPT: {transcript} ---")
            return transcript
        except Exception as e:
            logger.error(f"NVIDIA STT Failure: {e}")
            raise e # Pass up for fallback logic in VoiceManager
