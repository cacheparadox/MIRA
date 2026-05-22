from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from websocket.manager import ConnectionManager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MIRA Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ConnectionManager()
from memory.sqlite_fts import MemoryStore
memory_store = MemoryStore()

@app.on_event("startup")
async def startup_event():
    await memory_store.init_db()

@app.get("/")
async def root():
    return {"status": "MIRA Backend Running"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive general websocket message structure to support both text and binary
            message = await websocket.receive()
            if "text" in message:
                await manager.handle_message(websocket, message["text"])
            elif "bytes" in message:
                await manager.handle_bytes(websocket, message["bytes"])
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
