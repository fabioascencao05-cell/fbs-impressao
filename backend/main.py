from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.webhook      import router as webhook_router
from routes.live_process import router as ws_router
from workers.celery_app  import celery
import os, time

app = FastAPI(title="FBS Impressão — Backend", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(ws_router)   # WebSocket /ws/process/{arte_id}


@app.get("/")
def root():
    return {"status": "online", "service": "fbs-impressao", "version": "2.1.0"}


@app.get("/health")
def health():
    """
    Verifica se os workers Celery estão vivos via control.ping().
    Retorna 200 se >=1 worker responde, 503 se todos offline.
    """
    inicio = time.time()
    workers_resp = []
    erro_ping: str | None = None

    try:
        # timeout curto pra evitar travar a rota se Redis estiver fora
        workers_resp = celery.control.ping(timeout=2.0) or []
    except Exception as e:
        erro_ping = f"{type(e).__name__}: {str(e)[:200]}"

    elapsed_ms = int((time.time() - inicio) * 1000)
    workers_vivos = len(workers_resp)

    # Cada item de workers_resp é {"hostname": {"ok": "pong"}}
    nomes = []
    for w in workers_resp:
        if isinstance(w, dict):
            nomes.extend(w.keys())

    body = {
        "api":           "online",
        "service":       "fbs-impressao",
        "version":       "2.1.0",
        "celery": {
            "workers_vivos": workers_vivos,
            "workers":       nomes,
            "ping_ms":       elapsed_ms,
            "erro":          erro_ping,
        },
        "redis_url": (os.getenv("REDIS_URL", "redis://localhost:6379/0").split("@")[-1]),
    }

    from fastapi.responses import JSONResponse
    status_code = 200 if workers_vivos > 0 else 503
    return JSONResponse(content=body, status_code=status_code)
