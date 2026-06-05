from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.webhook import router as webhook_router
import os

app = FastAPI(title="FBS Vetor — Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)

@app.get("/")
def health():
    return {"status": "online", "service": "fbs-vetor"}
