import os
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()

_client: Client | None = None

def supabase_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_KEY"],
        )
    return _client


def atualizar_status(arte_id: str, status: str):
    supabase_client().table("artes_processadas").update({
        "status": status, "atualizado_em": "now()"
    }).eq("id", arte_id).execute()


def salvar_task_id(arte_id: str, celery_task_id: str):
    """Persiste o task_id do Celery para permitir revogação posterior."""
    supabase_client().table("artes_processadas").update({
        "celery_task_id": celery_task_id, "atualizado_em": "now()"
    }).eq("id", arte_id).execute()


def fazer_upload(nome_arquivo: str, conteudo: bytes, content_type: str) -> str:
    """Faz upload no bucket-saida e retorna a URL pública."""
    bucket = os.getenv("BUCKET_SAIDA", "bucket-saida")
    supabase_url = os.environ["SUPABASE_URL"]

    supabase_client().storage.from_(bucket).upload(
        path=nome_arquivo,
        file=conteudo,
        file_options={"content-type": content_type, "upsert": "true"},
    )

    return f"{supabase_url}/storage/v1/object/public/{bucket}/{nome_arquivo}"
