"""
live_process.py — WebSocket para streaming de progresso em tempo real
----------------------------------------------------------------------
Fluxo:
  1. Frontend conecta em ws://VPS:8000/ws/process/{arte_id}
  2. Celery task publica eventos no canal Redis "ws:{arte_id}"
  3. Este handler escuta o canal e repassa cada mensagem ao cliente

Eventos enviados pelo backend:
  { "type": "start",      "message": "..." }
  { "type": "preview",    "image": "<base64 JPEG>", "label": "..." }
  { "type": "layer",      "image": "<base64 JPEG>", "label": "Cor 2/4", "index": 2, "total": 4 }
  { "type": "progress",   "message": "...", "percent": 60 }
  { "type": "done",       "url_final": "https://...", "message": "Concluído!" }
  { "type": "error",      "message": "..." }
"""

import asyncio, json, os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

# redis.asyncio incluído em redis>=4.2
import redis.asyncio as aioredis

router = APIRouter()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# Tempo máximo de espera por arte (10 min) — evita conexão presa
WS_TIMEOUT = int(os.getenv("WS_TIMEOUT_SECONDS", "600"))


@router.websocket("/ws/process/{arte_id}")
async def ws_process(websocket: WebSocket, arte_id: str):
    await websocket.accept()

    r: aioredis.Redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"ws:{arte_id}")

    try:
        deadline = asyncio.get_event_loop().time() + WS_TIMEOUT

        async for raw in pubsub.listen():
            if asyncio.get_event_loop().time() > deadline:
                await websocket.send_json({"type": "error", "message": "Timeout — processamento demorou mais que o esperado."})
                break

            if raw["type"] != "message":
                continue

            try:
                payload = json.loads(raw["data"])
            except Exception:
                continue

            await websocket.send_json(payload)

            # Encerra a escuta quando o processamento terminar
            if payload.get("type") in ("done", "error"):
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        await pubsub.unsubscribe(f"ws:{arte_id}")
        await pubsub.aclose()
        await r.aclose()
