import os
import httpx
import json
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

class OpenRouterClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
        
    async def stream_chat(self, messages: list[dict], model: str = "google/gemini-2.5-flash") -> AsyncGenerator[str, None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "MIRA",
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "stream": True
        }
        
        timeout = httpx.Timeout(60.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        await response.aread()
                        response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                if "choices" in data and len(data["choices"]) > 0:
                                    delta = data["choices"][0].get("delta", {})
                                    content = delta.get("content")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                pass
            except httpx.HTTPStatusError as e:
                await e.response.aread()
                error_msg = f"{e} - Response: {e.response.text}"
                logger.error(f"OpenRouter HTTP Error: {error_msg}")
                raise Exception(error_msg)
            except Exception as e:
                error_msg = str(e)
                if hasattr(e, 'response') and hasattr(e.response, 'text'):
                    error_msg += f" - Response: {e.response.text}"
                logger.error(f"OpenRouter streaming error: {error_msg}")
                raise Exception(error_msg)
