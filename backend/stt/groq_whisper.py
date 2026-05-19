import logging
import io
from groq import AsyncGroq

logger = logging.getLogger(__name__)

class GroqSTTClient:
    def __init__(self, api_key: str):
        self.client = AsyncGroq(api_key=api_key)
        
    async def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe a chunk of audio using Groq's Whisper API.
        Expected format: bytes representing a valid audio file (e.g. wav or webm)
        """
        try:
            # We must pass a tuple of (filename, file_content) to the files parameter
            # We'll assume the frontend sends WebM or WAV format chunks.
            file_tuple = ("audio.webm", audio_bytes)
            
            response = await self.client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-large-v3-turbo",
                response_format="text"
            )
            return response
        except Exception as e:
            logger.error(f"Groq STT Error: {e}")
            return ""
