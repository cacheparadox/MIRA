import aiosqlite
import logging

logger = logging.getLogger(__name__)

class MemoryStore:
    def __init__(self, db_path: str = "mira.db"):
        self.db_path = db_path
        
    async def init_db(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS memories USING fts5(
                    content,
                    timestamp UNINDEXED,
                    importance UNINDEXED,
                    emotion UNINDEXED
                )
            ''')
            await db.commit()
            logger.info("Database initialized with FTS5")
            
    async def add_memory(self, content: str, importance: int = 1, emotion: str = "neutral"):
        import time
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute('''
                INSERT INTO memories (content, timestamp, importance, emotion)
                VALUES (?, ?, ?, ?)
            ''', (content, int(time.time()), importance, emotion))
            await db.commit()
            
    async def search_memory(self, query: str, limit: int = 5) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute('''
                SELECT content, timestamp, importance, emotion 
                FROM memories 
                WHERE memories MATCH ? 
                ORDER BY rank 
                LIMIT ?
            ''', (query, limit))
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
