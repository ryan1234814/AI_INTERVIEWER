"""
Nvidia STT via the hosted Whisper NIM on the NVIDIA API Catalog (build.nvidia.com).

Uses the NVCF (NVIDIA Cloud Functions) API to invoke the whisper-large-v3 model.
The audio is sent as multipart file upload (OpenAI-compatible format).

Requires a valid NVIDIA_API_KEY generated from build.nvidia.com/settings/api-keys.
"""
import requests
import logging
import asyncio
import io
from app.config import settings

logger = logging.getLogger(__name__)

# NVCF function ID for whisper-large-v3 on the NVIDIA API Catalog
# Retrieved from: https://build.nvidia.com/openai/whisper-large-v3
WHISPER_FUNCTION_ID = "b702f636-f60c-4a3d-a6f4-f3568c13bd7d"
NVCF_BASE_URL = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions"


class NvidiaSTT:
    """
    Nvidia STT via the hosted Whisper NIM (build.nvidia.com NVCF).

    Note: As of 2026, the NVIDIA hosted API catalog does not expose a standard
    REST endpoint for audio transcription (no /v1/audio/transcriptions on
    ai.api.nvidia.com or integrate.api.nvidia.com). Instead, whisper-large-v3
    is available as an NVCF cloud function, which may require the user to
    subscribe/opt-in on build.nvidia.com for it to be active on their account.

    If this fails consistently, the Groq Whisper STT (app.voice.stt.GroqSTT)
    is the primary and verified STT provider for this application.
    """

    def __init__(self, api_key: str = settings.NVIDIA_API_KEY):
        self.api_key = api_key
        self.invoke_url = f"{NVCF_BASE_URL}/{WHISPER_FUNCTION_ID}"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def transcribe_stream(self, audio_buffer: bytes) -> str:
        """
        Transcribe audio bytes via the NVCF whisper-large-v3 function.

        Sends the audio as a multipart file upload. Returns empty string on failure.
        """
        try:
            logger.info(f"--- NVIDIA WHISPER: Transcribing {len(audio_buffer)} bytes ---")

            def call_nvidia():
                files = {
                    "file": ("audio.mp3", io.BytesIO(audio_buffer), "audio/mpeg"),
                }
                response = requests.post(
                    self.invoke_url,
                    headers=self.headers,
                    files=files,
                    timeout=60,
                )
                if response.status_code != 200:
                    logger.error(
                        f"NVIDIA API Error {response.status_code}: {response.text[:300]}"
                    )
                    if response.status_code == 404:
                        logger.warning(
                            "NVIDIA Whisper NIM is not available at this endpoint. "
                            "Visit https://build.nvidia.com/openai/whisper-large-v3 "
                            "to check availability and generate the correct endpoint for your account."
                        )
                    response.raise_for_status()
                return response.json()

            response_json = await asyncio.to_thread(call_nvidia)
            transcript = response_json.get("text", "")

            logger.info(f"--- NVIDIA TRANSCRIPT: {transcript[:100]} ---")
            return transcript

        except requests.exceptions.HTTPError as e:
            logger.warning(f"NVIDIA STT unavailable: {e}. Groq STT will be used as primary.")
            return ""
        except Exception as e:
            logger.error(f"NVIDIA STT Failure: {e}")
            return ""
