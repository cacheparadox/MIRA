import json
import logging
import asyncio
from fastapi import WebSocket
from orchestration.session import SessionController

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
                logger.warning("Received text message that is not valid JSON")

    async def handle_bytes(self, websocket: WebSocket, data: bytes):
        if websocket in self.active_connections:
            session = self.active_connections[websocket]
            await session.process_audio_chunk(data)
