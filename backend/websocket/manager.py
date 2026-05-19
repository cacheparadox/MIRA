import json
import logging
import asyncio
from fastapi import WebSocket
from backend.orchestration.session import SessionController

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, SessionController] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        session = SessionController(websocket)
        self.active_connections[websocket] = session
        logger.info(f"Client connected. Active connections: {len(self.active_connections)}")
        asyncio.create_task(session.start())

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            session = self.active_connections.pop(websocket)
            session.stop()
            logger.info("Client disconnected.")

    async def handle_message(self, websocket: WebSocket, message: str):
        if websocket in self.active_connections:
            session = self.active_connections[websocket]
            try:
                data = json.loads(message)
                await session.process_event(data)
            except json.JSONDecodeError:
                # If it's binary audio, it will likely be received via receive_bytes, but currently main.py does receive_text.
                # Actually, WebSockets can receive text or bytes. If the frontend sends base64 audio, it's text.
                # If binary, we need to handle it. Let's assume JSON for control, and maybe base64 for audio.
                pass
