"""Qwen3-TTS via DashScope API - Free tier: 10,000 characters
Uses the OpenAI-compatible /v1/audio/speech endpoint.
Falls back to gTTS if DashScope key is not configured.
"""
import os
import logging
import tempfile
import asyncio
import aiohttp

logger = logging.getLogger(__name__)

# DashScope OpenAI-compatible endpoint (International/Singapore)
DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
# Chinese mainland: https://dashscope.aliyuncs.com/compatible-mode/v1


class QwenTTS:
    """Qwen3-TTS via DashScope API - high quality, low latency"""

    def __init__(self, api_key: str = None, voice: str = "Cherry", model: str = "qwen3-tts-flash"):
        self.api_key = api_key or os.getenv("DASHSCOPE_API_KEY", "")
        self.voice = voice
        self.model = model
        self.base_url = DASHSCOPE_BASE_URL
        self._available = bool(self.api_key)

        if not self._available:
            logger.warning("[QwenTTS] No DASHSCOPE_API_KEY set. Will fall back to gTTS.")
        else:
            logger.info(f"[QwenTTS] Initialized with model={model}, voice={voice}")

    @property
    def available(self) -> bool:
        return self._available

    async def get_audio_stream(self, text: str) -> bytes:
        """Generate audio bytes from text using Qwen3-TTS API.
        Returns MP3 audio bytes, or empty bytes on failure."""
        if not self._available:
            logger.info("[QwenTTS] Not available, falling back to gTTS")
            return await self._fallback_gtts(text)

        try:
            logger.info(f"[QwenTTS] Generating audio for: {text[:60]}...")
            start_time = asyncio.get_event_loop().time()

            # Use OpenAI-compatible /v1/audio/speech endpoint
            url = f"{self.base_url}/audio/speech"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.model,
                "input": text,
                "voice": self.voice,
                "response_format": "mp3"
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 200:
                        audio_data = await resp.read()
                        elapsed = asyncio.get_event_loop().time() - start_time
                        logger.info(f"[QwenTTS] Generated {len(audio_data)} bytes in {elapsed:.2f}s")
                        return audio_data
                    else:
                        error_text = await resp.text()
                        logger.error(f"[QwenTTS] API error {resp.status}: {error_text[:200]}")
                        return await self._fallback_gtts(text)

        except asyncio.TimeoutError:
            logger.error("[QwenTTS] Request timed out, falling back to gTTS")
            return await self._fallback_gtts(text)
        except Exception as e:
            logger.error(f"[QwenTTS] Error: {e}, falling back to gTTS")
            return await self._fallback_gtts(text)

    async def _fallback_gtts(self, text: str) -> bytes:
        """Fallback to Google TTS if Qwen API fails"""
        try:
            from app.voice.gtts_tts import GTTSEngine
            gtts = GTTSEngine(lang='en', slow=False)
            return await gtts.get_audio_stream(text)
        except Exception as e:
            logger.error(f"[QwenTTS] gTTS fallback also failed: {e}")
            return b""
