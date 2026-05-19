import asyncio
import logging
from fastapi import WebSocket
from typing import Optional

logger = logging.getLogger(__name__)

class SessionController:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.state = "IDLE"
        self.running = False
        self.credentials = {}

        # Placeholders for pipelines
        self.stt_task: Optional[asyncio.Task] = None
        self.llm_task: Optional[asyncio.Task] = None
        self.tts_task: Optional[asyncio.Task] = None

    async def start(self):
        self.running = True
        logger.info("Session started")

    def stop(self):
        self.running = False
        self._cancel_active_tasks()
        logger.info("Session stopped")

    def _cancel_active_tasks(self):
        for task in [self.stt_task, self.llm_task, self.tts_task]:
            if task and not task.done():
                task.cancel()

    async def process_event(self, event: dict):
        event_type = event.get("type")
        
        if event_type == "CREDENTIALS":
            self.credentials = event.get("payload", {})
            logger.info("Credentials updated")
            
        elif event_type == "AUDIO_CHUNK":
            # Buffer audio for STT
            audio_data = event.get("payload")
            # TODO: Append to STT buffer
            
        elif event_type == "SPEECH_END":
            # Trigger LLM
            logger.info("User stopped speaking, trigger response")
            self._cancel_active_tasks()
            # self.llm_task = asyncio.create_task(self.generate_response())
            
        elif event_type == "INTERRUPT":
            logger.info("User interrupted. Cancelling playback.")
            self._cancel_active_tasks()
            await self.websocket.send_json({"type": "HARD_STOP"})
