from fastapi import APIRouter, Request, HTTPException, Header
from workers.task_silk import processar_silk
from workers.task_dtf  import processar_dtf
from workers.celery_app import celery
from utils.supabase_client import supabase_client
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


@router.post("/cancel-task/{arte_id}")
async def cancelar_task(arte_id: str, x_webhook_secret: str | None = Header(default=None)):
    """
    Revoga a task Celery associada a esta arte e marca como Cancelado.
    Usa SIGKILL para parar imediatamente mesmo que a task esteja travada.
    """
    _validar_secret(x_webhook_secret)

    # Busca o celery_task_id salvo no banco
    resp = supabase_client().table("artes_processadas") \
        .select("id, status, celery_task_id") \
        .eq("id", arte_id).single().execute()

    arte = resp.data
    if not arte:
        raise HTTPException(status_code=404, detail="Arte não encontrada")

    if arte["status"] not in ("Processando", "Pendente"):
        raise HTTPException(status_code=409,
            detail=f"Arte está com status '{arte['status']}' — não pode ser cancelada.")

    # Revoga via Celery control (SIGKILL = para imediatamente)
    task_id = arte.get("celery_task_id")
    if task_id:
        celery.control.revoke(task_id, terminate=True, signal="SIGKILL")

    # Atualiza banco independente de ter task_id (cobre Pendentes na fila)
    supabase_client().table("artes_processadas").update({
        "status": "Cancelado",
        "erro_mensagem": "Cancelado manualmente pelo operador.",
        "atualizado_em": "now()",
    }).eq("id", arte_id).execute()

    return {"cancelado": True, "arte_id": arte_id, "task_id": task_id}
