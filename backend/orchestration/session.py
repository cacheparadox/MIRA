import asyncio
import logging
import os
import re
from fastapi import WebSocket
from typing import Optional

from stt.groq_whisper import GroqSTTClient
from conversation.llm import OpenRouterClient
from tts.kokoro import KokoroTTSClient
from memory.sqlite_fts import MemoryStore

logger = logging.getLogger(__name__)

class SessionController:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.state = "IDLE"
        self.running = False
        self.credentials = {}

        self.audio_buffer = bytearray()

        # Clients will be initialized when keys are received or on demand
        self.stt_client: Optional[GroqSTTClient] = None
        self.llm_client: Optional[OpenRouterClient] = None
        self.tts_client: Optional[KokoroTTSClient] = None
        self.memory_store = MemoryStore()

        self.stt_task: Optional[asyncio.Task] = None
        self.llm_task: Optional[asyncio.Task] = None
        self.tts_task: Optional[asyncio.Task] = None
        self.filler_task: Optional[asyncio.Task] = None

    async def start(self):
        self.running = True
        await self.memory_store.init_db()
        logger.info("Session started")

    def stop(self):
        self.running = False
        self._cancel_active_tasks(reason="stop")
        logger.info("Session stopped")

    async def _send_debug(self, msg: str):
        if self.running:
            try:
                await self.websocket.send_json({"type": "DEBUG", "payload": msg})
            except Exception:
                pass

    async def _handle_concurrent_speech(self):
        """Transcribes incoming audio while MIRA is busy. Cancels MIRA only if the user actually spoke."""
        if not self.audio_buffer:
            return
            
        audio_bytes = bytes(self.audio_buffer)
        self.audio_buffer.clear()
        
        try:
            user_text = await self.stt_client.transcribe(audio_bytes)
            clean_text = re.sub(r'[^a-zA-Z0-9]', '', user_text).lower() if user_text else ""
            hallucinations = ["silence", "audiologo", "thankyou", "amen", "peter", "hello", "hmm", "ah", "well", "letssee", "letmesee"]
            
            if len(clean_text) >= 2 and clean_text not in hallucinations:
                logger.info(f"User barged in with valid speech: {user_text}")
                self._cancel_active_tasks(reason="BARGE_IN")
                await self.websocket.send_json({"type": "HARD_STOP"})
                
                # Directly process the barge-in as the new turn
                self.state = "THINKING"
                logger.info(f"Transcribed user text: {user_text}")
                import datetime
                timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                await self._send_debug(f"[{timestamp}] STT (Groq) Output: {user_text}")
                
                await self.websocket.send_json({"type": "TRANSCRIPT", "payload": f"\nUser: {user_text}"})
                
                self.llm_task = asyncio.create_task(self.generate_and_stream_response(user_text))
            else:
                logger.info("Concurrent speech ignored (noise/hallucination).")
        except Exception as e:
            logger.error(f"Concurrent STT Error: {e}")

    def _cancel_active_tasks(self, reason: str = ""):
        import traceback
        logger.info(f"Cancelling active tasks. Reason: {reason}")
        for line in traceback.format_stack():
            logger.info(line.strip())
            
        for task in [self.stt_task, self.llm_task, self.tts_task, self.filler_task]:
            if task and not task.done():
                logger.info(f"Cancelling task {task}")
                task.cancel()
        self.state = "IDLE"

    async def process_event(self, event: dict):
        event_type = event.get("type")
        
        if event_type == "CREDENTIALS":
            self.credentials = event.get("payload", {})
            logger.info("Credentials updated")
            self._init_clients()
            
        elif event_type == "SPEECH_END":
            logger.info("User stopped speaking, trigger response")
            if self.running:
                import datetime
                timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                await self._send_debug(f"[VERBOSE] [{timestamp}] [SYSTEM] Received SPEECH_END")
                
                if self.state in ["THINKING", "SPEAKING"]:
                    asyncio.create_task(self._handle_concurrent_speech())
                else:
                    self._cancel_active_tasks(reason="SPEECH_END")
                    self.stt_task = asyncio.create_task(self.transcribe_and_respond())
            
        elif event_type == "INTERRUPT":
            logger.info("User interrupted. Cancelling playback.")
            import datetime
            timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            await self._send_debug(f"[VERBOSE] [{timestamp}] [SYSTEM] Received INTERRUPT")
            self._cancel_active_tasks(reason="INTERRUPT")
            await self.websocket.send_json({"type": "HARD_STOP"})

    async def process_audio_chunk(self, chunk: bytes):
        if self.running:
            self.audio_buffer.extend(chunk)

    def _init_clients(self):
        groq_key = self.credentials.get("groq_api_key") or os.getenv("GROQ_API_KEY")
        openrouter_key = self.credentials.get("openrouter_api_key") or os.getenv("OPENROUTER_API_KEY")
        
        if groq_key:
            self.stt_client = GroqSTTClient(api_key=groq_key)
        if openrouter_key:
            self.llm_client = OpenRouterClient(api_key=openrouter_key)
            
        # Kokoro doesn't require key, but needs URL
        self.tts_client = KokoroTTSClient()

    async def transcribe_and_respond(self):
        self.state = "THINKING"
        self.filler_task = asyncio.create_task(self.play_filler())
        
        if not self.audio_buffer:
            logger.warning("Audio buffer is empty")
            self._cancel_active_tasks(reason="empty_buffer")
            return

        # 1. Transcribe audio using STT
        audio_bytes = bytes(self.audio_buffer)
        self.audio_buffer.clear() # Clear buffer for next turn

        if not self.stt_client:
            groq_key = os.getenv("GROQ_API_KEY")
            if groq_key:
                self.stt_client = GroqSTTClient(api_key=groq_key)
            else:
                logger.error("STT Client not initialized (no key)")
                await self.websocket.send_json({"type": "TRANSCRIPT", "payload": "System: STT key missing."})
                self.state = "IDLE"
                return

        logger.info("Starting transcription...")
        try:
            user_text = await self.stt_client.transcribe(audio_bytes)
        except Exception as e:
            logger.error(f"STT Error: {e}")
            await self._send_debug(f"STT Error: {e}")
            self.state = "IDLE"
            return
        
        if not user_text or not user_text.strip():
            logger.info("No transcription content")
            self.state = "IDLE"
            return

        clean_text = re.sub(r'[^a-zA-Z0-9]', '', user_text).lower()
        if len(clean_text) < 2:
            logger.info("Transcription too short or just punctuation, ignoring.")
            self.state = "IDLE"
            return
            
        hallucinations = ["silence", "audiologo", "thankyou", "amen", "peter", "hello", "hmm", "ah", "well", "letssee", "letmesee"]
        if clean_text in hallucinations:
            logger.info("Transcription is a known hallucination, ignoring.")
            self.state = "IDLE"
            return

        logger.info(f"Transcribed user text: {user_text}")
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        await self._send_debug(f"[VERBOSE] [{timestamp}] STT (Groq) Output: {user_text}")
        await self.websocket.send_json({"type": "TRANSCRIPT", "payload": f"User: {user_text}"})

        # 2. Get LLM Response
        if not self.llm_client:
            openrouter_key = os.getenv("OPENROUTER_API_KEY")
            if openrouter_key:
                self.llm_client = OpenRouterClient(api_key=openrouter_key)
            else:
                logger.error("LLM Client not initialized (no key)")
                await self.websocket.send_json({"type": "TRANSCRIPT", "payload": "System: OpenRouter key missing."})
                self.state = "IDLE"
                return

        self.llm_task = asyncio.create_task(self.generate_and_stream_response(user_text))

    async def generate_and_stream_response(self, user_text: str):
        try:
            # Query memory store for previous user queries/contexts
            try:
                memories = await self.memory_store.search_memory(user_text, limit=3)
                context_str = "\n".join([m["content"] for m in memories])
            except Exception as e:
                logger.error(f"Memory lookup error: {e}")
                await self._send_debug(f"Memory lookup error: {e}")
                context_str = ""

            system_prompt = (
                "You are MIRA, an emotionally intelligent, realtime voice companion. You are speaking aloud over a voice call.\n"
                "CRITICAL RULES FOR REALISM:\n"
                "1. Be extremely conversational, warm, and natural. Speak like a real human on a phone call.\n"
                "2. Keep responses brief (1-3 sentences max). Silence is deadly on a voice call, so get to the point quickly.\n"
                "3. Use natural spoken phrasing. Avoid lists, markdown, formal transitions, or robotic AI language like 'As an AI...'.\n"
                "4. React emotionally to the user's tone. If they are excited, be excited. If they are sad, be empathetic.\n"
                "5. DO NOT USE EMOJIS or any non-verbal symbols. You are speaking aloud, emojis cannot be spoken.\n"
            )
            if context_str:
                system_prompt += f"\n\nHere is relevant context from past conversations:\n{context_str}"

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ]

            import datetime
            timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            await self._send_debug(f"[VERBOSE] [{timestamp}] LLM (OpenRouter) Input: {messages}")

            model = self.credentials.get("model") or "openai/gpt-oss-120b:free"
            logger.info(f"Calling LLM with model: {model}")

            sentence_buffer = ""
            full_response = ""
            audio_started = False

            await self.websocket.send_json({"type": "TRANSCRIPT", "payload": "\nMIRA: "})

            first_chunk_received = False
            async for chunk in self.llm_client.stream_chat(messages, model=model):
                if not self.running:
                    break
                    
                if not first_chunk_received and chunk:
                    import datetime
                    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    await self._send_debug(f"[VERBOSE] [{ts}] LLM (OpenRouter) First token received")
                    first_chunk_received = True
                
                # Send text chunk to frontend
                await self.websocket.send_json({"type": "TRANSCRIPT", "payload": chunk})
                
                full_response += chunk
                sentence_buffer += chunk

                # Check if we have a full sentence or natural pause
                if any(p in sentence_buffer for p in [".", "?", "!", "\n"]):
                    parts = self._split_sentences(sentence_buffer)
                    if len(parts) > 1:
                        for part in parts[:-1]:
                            if part.strip():
                                await self.speak_sentence(part, audio_started)
                                audio_started = True
                        sentence_buffer = parts[-1]

            # Speak any remaining text in buffer
            if sentence_buffer.strip() and self.running:
                await self.speak_sentence(sentence_buffer, audio_started)

            timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            await self._send_debug(f"[VERBOSE] [{timestamp}] LLM (OpenRouter) Output: {full_response}")

            # Store the interaction in memory
            if full_response.strip():
                try:
                    await self.memory_store.add_memory(f"User: {user_text}\nMIRA: {full_response}")
                except Exception as e:
                    logger.error(f"Error saving memory: {e}")

        except asyncio.CancelledError:
            logger.info("LLM generation task cancelled")
            await self._send_debug(f"[VERBOSE] [SYSTEM] LLM task was cancelled (e.g. by INTERRUPT or SPEECH_END).")
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"Error in LLM response loop:\n{error_trace}")
            await self._send_debug(f"LLM Error: {type(e).__name__} - {str(e)}\n{error_trace}")
        finally:
            if audio_started:
                await self.websocket.send_json({"type": "AUDIO_END"})
            self.state = "IDLE"

    def _split_sentences(self, text: str) -> list[str]:
        # Split on typical terminal punctuation but preserve them
        parts = re.split(r'([.!?\n]+)', text)
        sentences = []
        current = ""
        for i, part in enumerate(parts):
            if i % 2 == 0:
                current = part
            else:
                sentences.append((current + part).strip())
                current = ""
        if current:
            sentences.append(current)
        return sentences

    def _sanitize_for_tts(self, text: str) -> str:
        # Remove text in asterisks e.g. *sighs*
        text = re.sub(r'\*.*?\*', '', text)
        # Remove text in parentheses e.g. (laughs)
        text = re.sub(r'\(.*?\)', '', text)
        return text.strip()

    async def speak_sentence(self, sentence: str, audio_started: bool):
        if not self.tts_client:
            self.tts_client = KokoroTTSClient()
        
        clean_sentence = self._sanitize_for_tts(sentence)
        if not clean_sentence:
            return

        logger.info(f"Speaking sentence: {clean_sentence}")
        import datetime
        timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        await self._send_debug(f"[VERBOSE] [{timestamp}] TTS (Kokoro) Input: {clean_sentence}")
        try:
            kokoro_voice = self.credentials.get("kokoro_voice", "af_heart")
            
            full_audio = bytearray()
            async for audio_chunk in self.tts_client.stream_audio(clean_sentence, voice=kokoro_voice):
                if not self.running:
                    break
                if audio_chunk:
                    full_audio.extend(audio_chunk)
            
            if full_audio and self.running:
                if not audio_started:
                    await self.websocket.send_json({"type": "AUDIO_START"})
                    self.state = "SPEAKING"
                await self.websocket.send_bytes(bytes(full_audio))
        except Exception as e:
            logger.error(f"Error speaking sentence: {e}")
            await self._send_debug(f"TTS Error: {e}")

    async def play_filler(self):
        await asyncio.sleep(0.8)
        if self.state == "THINKING" and self.running:
            import random
            filler = random.choice(["Hmm...", "Let me see...", "Well...", "Ah...", "Let's see..."])
            logger.info(f"Playing filler: {filler}")
            import datetime
            timestamp = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            await self._send_debug(f"[VERBOSE] [{timestamp}] TTS (Kokoro) Filler: {filler}")
            try:
                if not self.tts_client:
                    self.tts_client = KokoroTTSClient()
                kokoro_voice = self.credentials.get("kokoro_voice", "af_heart")
                
                full_audio = bytearray()
                async for chunk in self.tts_client.stream_audio(filler, voice=kokoro_voice):
                    if self.state != "THINKING" or not self.running:
                        break
                    if chunk:
                        full_audio.extend(chunk)
                        
                if full_audio and self.state == "THINKING" and self.running:
                    await self.websocket.send_json({"type": "AUDIO_START"})
                    await self.websocket.send_bytes(bytes(full_audio))
            except Exception as e:
                logger.error(f"Error playing filler: {e}")
