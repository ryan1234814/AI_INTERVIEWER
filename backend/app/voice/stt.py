import logging
from deepgram import DeepgramClient, PrerecordedOptions, FileSource
from app.config import settings
import aiofiles

logger = logging.getLogger(__name__)

class DeepgramSTT:
    def __init__(self, api_key: str = settings.DEEPGRAM_API_KEY):
        self.client = DeepgramClient(api_key)

    async def transcribe_audio(self, audio_path: str) -> str:
        try:
            with open(audio_path, "rb") as file:
                buffer_data = file.read()

            payload: FileSource = {
                "buffer": buffer_data,
            }

            options = PrerecordedOptions(
                model="nova-2",
                smart_format=True,
            )

            response = self.client.listen.prerecorded.v("1").transcribe_file(payload, options)
            transcript = response["results"]["channels"][0]["alternatives"][0]["transcript"]
            return transcript
        except Exception as e:
            logger.error(f"Deepgram STT Error: {e}")
            return ""

    async def transcribe_stream(self, audio_buffer: bytes) -> str:
        try:
            logger.info(f"Transcribing audio buffer of size {len(audio_buffer)} bytes")
            payload = {
                "buffer": audio_buffer,
            }
            options = PrerecordedOptions(
                model="nova-2",
                smart_format=True,
                utterances=True,
                punctuate=True,
            )
            
            import asyncio
            # Use asyncio.to_thread for synchronous call to prevent event loop blocking
            response = await asyncio.to_thread(
                self.client.listen.prerecorded.v("1").transcribe_file,
                payload, 
                options
            )
            
            # Log response for deep debugging
            logger.info(f"Deepgram raw response: {response}")
            
            # Handle both object and dict responses
            if hasattr(response, 'results'):
                transcript = response.results.channels[0].alternatives[0].transcript
            elif isinstance(response, dict):
                transcript = response.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
            else:
                transcript = ""

            if not transcript:
                logger.warning("Deepgram returned an empty transcript. This could mean the audio was silent or unsupported.")
            else:
                logger.info(f"STT Transcript found: {transcript}")
                
            return transcript
        except Exception as e:
            logger.error(f"Deepgram Stream STT Error: {e}", exc_info=True)
            return ""

class GroqSTT:
    def __init__(self, api_key: str = settings.GROQ_API_KEY):
        from openai import OpenAI
        self.client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=api_key
        )

    async def transcribe_stream(self, audio_buffer: bytes) -> str:
        try:
            import io
            import asyncio
            logger.info(f"--- GROQ WHISPER: Transcribing {len(audio_buffer)} bytes ---")
            
            def call_groq():
                # Explicitly provide filename and mimetype to avoid 'invalid media' error
                audio_file = ("audio.webm", io.BytesIO(audio_buffer), "audio/webm")
                response = self.client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    response_format="text"
                )
                return response

            transcript = await asyncio.to_thread(call_groq)
            logger.info(f"--- GROQ TRANSCRIPT: {transcript} ---")
            return str(transcript).strip()
        except Exception as e:
            logger.error(f"Groq STT Failure: {e}")
            return ""
