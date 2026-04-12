import logging
import os
from deepgram import DeepgramClient, SpeakOptions
from app.config import settings

logger = logging.getLogger(__name__)

class DeepgramTTS:
    def __init__(self, api_key: str = settings.DEEPGRAM_API_KEY):
        self.client = DeepgramClient(api_key)

    async def text_to_speech(self, text: str, output_path: str = "output.mp3") -> str:
        try:
            options = SpeakOptions(
                model="aura-helios-en",
                encoding="mp3",
                container="none"
            )

            response = self.client.speak.v("1").save(output_path, {"text": text}, options)
            return output_path
        except Exception as e:
            logger.error(f"Deepgram TTS Error: {e}")
            return ""

    async def get_audio_stream(self, text: str) -> bytes:
        try:
            logger.info(f"Generating speech for text: {text[:50]}...")
            options = SpeakOptions(
                model="aura-helios-en",
                encoding="mp3",
            )
            
            # Using a temp file for reliable storage across SDK sub-versions
            temp_path = f"temp_{os.getpid()}_voice.mp3"
            
            # Deepgram v3 SDK speak.v("1").save
            source = {"text": text}
            
            import asyncio
            await asyncio.to_thread(
                self.client.speak.v("1").save,
                temp_path, 
                source, 
                options
            )
            
            if os.path.exists(temp_path):
                with open(temp_path, "rb") as f:
                    data = f.read()
                os.remove(temp_path)
                logger.info(f"Generated {len(data)} bytes of audio")
                return data
            else:
                logger.error("TTS temp file was not created")
                return b""
        except Exception as e:
            logger.error(f"Deepgram Stream TTS Error: {e}")
            return b""
