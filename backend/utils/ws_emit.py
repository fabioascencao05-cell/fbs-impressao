"""
ws_emit.py — Publicação síncrona de eventos WebSocket via Redis pub/sub.
Usado dentro das tasks Celery (contexto síncrono).
"""

import json, os, base64
import redis
import cv2
import numpy as np
from dotenv import load_dotenv
load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def _get_redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


def emit(arte_id: str, tipo: str, **kwargs):
    """Publica um evento no canal Redis do arte_id. Falha silenciosamente."""
    try:
        r = _get_redis()
        r.publish(f"ws:{arte_id}", json.dumps({"type": tipo, **kwargs}))
        r.close()
    except Exception as e:
        print(f"[ws_emit] falha ao publicar {tipo}: {e}")


def img_bgr_to_b64(img_bgr: np.ndarray, max_dim: int = 800, quality: int = 72) -> str:
    """
    Redimensiona para max_dim no lado maior e codifica em JPEG Base64.
    Mantém proporção. Retorna string Base64 (sem prefixo data:...).
    """
    h, w = img_bgr.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img_bgr = cv2.resize(img_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    _, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def img_pil_to_b64(pil_img, max_dim: int = 800, quality: int = 72) -> str:
    """Converte PIL Image (RGBA/RGB) para Base64 JPEG."""
    import io
    from PIL import Image
    pil_img = pil_img.convert("RGB")
    w, h = pil_img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")
