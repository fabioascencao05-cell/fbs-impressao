"""
task_dtf.py — Pipeline DTF Alta Qualidade
------------------------------------------
1. Download imagem original
2. Upscale 4x via Replicate API (Real-ESRGAN)
3. Download resultado upscalado
4. rembg — remoção cirúrgica de fundo com IA
5. Salva como PNG 300 DPI com canal alpha (transparência)
6. Upload para bucket-saida
7. Atualiza status no banco
"""

import io, os, time, httpx
from PIL import Image
from rembg import remove
from celery import shared_task
import replicate
from dotenv import load_dotenv
load_dotenv()

from utils.supabase_client import supabase_client, atualizar_status, fazer_upload

BUCKET_SAIDA = os.getenv("BUCKET_SAIDA", "bucket-saida")
REPLICATE_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")


def _baixar_bytes(url: str) -> bytes:
    resp = httpx.get(url, timeout=120, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _upscale_replicate(img_bytes: bytes) -> bytes:
    """Envia para Real-ESRGAN via Replicate e retorna PNG upscalado."""
    os.environ["REPLICATE_API_TOKEN"] = REPLICATE_TOKEN

    # Salva em temp para enviar como file-like
    buf = io.BytesIO(img_bytes)
    buf.name = "input.png"

    output = replicate.run(
        "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee2d" +
        "cbe2f7d63c1d0e67",  # Real-ESRGAN x4plus
        input={
            "image": buf,
            "scale": 4,
            "face_enhance": False,
        }
    )

    # output é URL do resultado
    url_resultado = str(output)
    return _baixar_bytes(url_resultado)


def _remover_fundo(img_bytes: bytes) -> tuple[bytes, float]:
    """Remove fundo com rembg. Retorna PNG com alpha + score de confiança estimado."""
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    saida = remove(img)  # rembg retorna Image RGBA

    # Score: proporção de pixels com alpha > 0 vs total
    alpha = saida.split()[3]
    arr = list(alpha.getdata())
    pixels_validos = sum(1 for a in arr if a > 10)
    score = round(pixels_validos / max(len(arr), 1), 3)

    buf = io.BytesIO()
    saida.save(buf, format="PNG", dpi=(300, 300))
    return buf.getvalue(), score


@shared_task(bind=True, name="task_dtf", max_retries=2)
def processar_dtf(self, arte_id: str, url_original: str):
    try:
        atualizar_status(arte_id, "Processando")

        # 1. Download original
        img_bytes = _baixar_bytes(url_original)

        # 2. Upscale 4x via Replicate (Real-ESRGAN)
        if REPLICATE_TOKEN:
            try:
                img_bytes = _upscale_replicate(img_bytes)
            except Exception as e:
                print(f"[dtf] Replicate falhou ({e}), usando Pillow LANCZOS como fallback")
                img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                w, h = img_pil.size
                img_pil = img_pil.resize((w * 4, h * 4), Image.LANCZOS)
                buf = io.BytesIO()
                img_pil.save(buf, format="PNG")
                img_bytes = buf.getvalue()
        else:
            # Sem token Replicate: Pillow LANCZOS 4x
            img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
            w, h = img_pil.size
            img_pil = img_pil.resize((w * 4, h * 4), Image.LANCZOS)
            buf = io.BytesIO()
            img_pil.save(buf, format="PNG")
            img_bytes = buf.getvalue()

        # 3. Remoção de fundo com rembg
        png_final, score = _remover_fundo(img_bytes)

        # 4. Upload para Supabase
        nome_saida = f"dtf_{arte_id}.png"
        url_final = fazer_upload(nome_saida, png_final, "image/png")

        # 5. Status final
        status = "Concluido" if score >= 0.30 else "Revisao_Manual"
        supabase_client().table("artes_processadas").update({
            "status": status,
            "url_final": url_final,
            "score_confianca": score,
            "atualizado_em": "now()",
        }).eq("id", arte_id).execute()

    except Exception as exc:
        print(f"[dtf] ERRO {arte_id}: {exc}")
        try:
            supabase_client().table("artes_processadas").update({
                "status": "Erro",
                "erro_mensagem": str(exc)[:400],
            }).eq("id", arte_id).execute()
        except: pass
        raise self.retry(exc=exc, countdown=60)
