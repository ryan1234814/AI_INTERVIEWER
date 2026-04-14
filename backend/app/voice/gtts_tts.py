"""Google TTS implementation - more reliable than EdgeTTS"""
import logging
import tempfile
import os
from gtts import gTTS

logger = logging.getLogger(__name__)

class GTTSEngine:
    """Google Text-to-Speech - free, no API key needed"""
    
    def __init__(self, lang: str = 'en', slow: bool = False):
        self.lang = lang
        self.slow = slow
    
    async def get_audio_stream(self, text: str) -> bytes:
        """Generate audio bytes from text using Google TTS"""
        try:
            logger.info(f"[GTTS] Generating voice for: {text[:50]}...")
            
            # Create gTTS object
            tts = gTTS(text=text, lang=self.lang, slow=self.slow)
            
            # Save to temporary file and read back as bytes
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                tmp_path = tmp_file.name
            
            tts.save(tmp_path)
            
            # Read the audio file as bytes
            with open(tmp_path, 'rb') as f:
                audio_data = f.read()
            
            # Clean up temp file
            os.unlink(tmp_path)
            
            logger.info(f"[GTTS] Generated {len(audio_data)} bytes of audio")
            return audio_data
            
        except Exception as e:
            logger.error(f"[GTTS] Error: {e}")
            return b""
