import httpx
import logging
import os
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

class KokoroTTSClient:
    def __init__(self, base_url: str = None):
        """
        Assumes Kokoro-FastAPI or similar OpenAI-compatible local TTS server.
        """
        self.base_url = base_url or os.getenv("KOKORO_BASE_URL", "http://kokoro:8880/v1")
        
    async def stream_audio(self, text: str, voice: str = "af_heart") -> AsyncGenerator[bytes, None]:
        if not text.strip():
            return
            
        payload = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "stream": True
        }
        
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream("POST", f"{self.base_url}/audio/speech", json=payload) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except Exception as e:
            logger.error(f"Kokoro TTS Error: {e}")
            yield b""
