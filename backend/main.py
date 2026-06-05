from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.webhook      import router as webhook_router
from routes.live_process import router as ws_router
import os

app = FastAPI(title="FBS Impressão — Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(ws_router)   # WebSocket /ws/process/{arte_id}

@app.get("/")
def health():
    return {"status": "online", "service": "fbs-impressao", "version": "2.0.0"}
