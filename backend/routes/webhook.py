from fastapi import APIRouter, Request, HTTPException, Header
from workers.task_silk import processar_silk
from workers.task_dtf  import processar_dtf
import os

router = APIRouter()

SECRET = os.getenv("WEBHOOK_SECRET", "fbs-vetor-secret-2024")


def _validar_secret(x_webhook_secret: str | None):
    if x_webhook_secret != SECRET:
        raise HTTPException(status_code=403, detail="Webhook secret inválido")


@router.post("/webhook")
async def webhook_nova_arte(request: Request, x_webhook_secret: str | None = Header(default=None)):
    _validar_secret(x_webhook_secret)
    payload = await request.json()

    arte_id    = payload.get("id")
    metodo     = payload.get("metodo")
    url_orig   = payload.get("url_original")
    num_cores  = int(payload.get("num_cores", 4))
    blur_level = int(payload.get("blur_level", 3))
    turdsize   = int(payload.get("turdsize", 2))

    if not arte_id or not metodo or not url_orig:
        raise HTTPException(status_code=400, detail="Payload incompleto")

    if metodo == "Silk":
        processar_silk.delay(arte_id, url_orig, num_cores, blur_level, turdsize)
    elif metodo == "DTF":
        processar_dtf.delay(arte_id, url_orig)
    else:
        raise HTTPException(status_code=400, detail=f"Método desconhecido: {metodo}")

    return {"enfileirado": True, "id": arte_id, "metodo": metodo}


@router.post("/webhook/reprocessar")
async def webhook_reprocessar(request: Request, x_webhook_secret: str | None = Header(default=None)):
    """Re-processa Silk com novos parâmetros de slider."""
    _validar_secret(x_webhook_secret)
    payload    = await request.json()
    arte_id    = payload.get("id")
    url_orig   = payload.get("url_original")
    num_cores  = int(payload.get("num_cores", 4))
    blur_level = int(payload.get("blur_level", 3))
    turdsize   = int(payload.get("turdsize", 2))

    if not arte_id or not url_orig:
        raise HTTPException(status_code=400, detail="id e url_original obrigatórios")

    processar_silk.delay(arte_id, url_orig, num_cores, blur_level, turdsize)
    return {"reprocessando": True, "id": arte_id}
