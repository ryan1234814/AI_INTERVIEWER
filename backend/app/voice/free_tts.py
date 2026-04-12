import edge_tts
import asyncio
import logging
import io

logger = logging.getLogger(__name__)

class EdgeTTS:
    def __init__(self, voice: str = "en-US-GuyNeural"):
        self.voice = voice

    async def get_audio_stream(self, text: str) -> bytes:
        try:
            logger.info(f"--- EDGE TTS: Generating voice for: {text[:50]}... ---")
            communicate = edge_tts.Communicate(text, self.voice)
            
            # Use a buffer to collect audio data
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            
            logger.info(f"--- EDGE TTS: Generated {len(audio_data)} bytes ---")
            return audio_data
        except Exception as e:
            logger.error(f"Edge TTS Error: {e}")
            return b""
