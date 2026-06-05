"""
task_dtf.py — Pipeline DTF Alta Qualidade com streaming WebSocket
------------------------------------------------------------------
1. Download imagem original                → emit start
2. Upscale 4x Replicate Real-ESRGAN        → emit progress "Efetuando Upscale…"
3. rembg — remoção de fundo                → emit preview PNG intermediário
4. Salva PNG 300 DPI transparente
5. Upload bucket-saida                     → emit done
"""

import io, os, httpx
from PIL import Image
from rembg import remove
from celery import shared_task
import replicate
from dotenv import load_dotenv
load_dotenv()

from utils.supabase_client import supabase_client, atualizar_status, fazer_upload
from utils.ws_emit import emit, img_pil_to_b64

REPLICATE_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")


def _baixar_bytes(url: str) -> bytes:
    resp = httpx.get(url, timeout=120, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _upscale_replicate(img_bytes: bytes) -> bytes:
    os.environ["REPLICATE_API_TOKEN"] = REPLICATE_TOKEN
    buf = io.BytesIO(img_bytes)
    buf.name = "input.png"
    output = replicate.run(
        "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee2d"
        "cbe2f7d63c1d0e67",
        input={"image": buf, "scale": 4, "face_enhance": False}
    )
    return _baixar_bytes(str(output))


def _upscale_lanczos(img_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
    w, h = img.size
    img = img.resize((w * 4, h * 4), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@shared_task(bind=True, name="task_dtf", max_retries=2)
def processar_dtf(self, arte_id: str, url_original: str):
    try:
        atualizar_status(arte_id, "Processando")
        emit(arte_id, "start", message="⚙️ Iniciando pipeline DTF Alta Qualidade…")

        # 1. Download
        emit(arte_id, "progress", message="📥 Baixando imagem original…", percent=5)
        img_bytes = _baixar_bytes(url_original)

        # Preview do original
        orig_pil = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        emit(arte_id, "preview",
             image=img_pil_to_b64(orig_pil, max_dim=600),
             label="Imagem original recebida")

        # 2. Upscale 4x
        emit(arte_id, "progress", message="🔬 Efetuando Upscale 4x (Real-ESRGAN)…", percent=20)
        if REPLICATE_TOKEN:
            try:
                img_bytes = _upscale_replicate(img_bytes)
                emit(arte_id, "progress", message="✅ Upscale Real-ESRGAN concluído.", percent=55)
            except Exception as e:
                emit(arte_id, "progress",
                     message=f"⚠️ Replicate indisponível ({e}). Usando Pillow LANCZOS…", percent=35)
                img_bytes = _upscale_lanczos(img_bytes)
                emit(arte_id, "progress", message="✅ Upscale LANCZOS concluído.", percent=55)
        else:
            emit(arte_id, "progress", message="📐 Upscale Pillow LANCZOS 4x…", percent=30)
            img_bytes = _upscale_lanczos(img_bytes)
            emit(arte_id, "progress", message="✅ Upscale concluído.", percent=55)

        # Preview upscalado
        up_pil = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        emit(arte_id, "preview",
             image=img_pil_to_b64(up_pil, max_dim=700),
             label="Imagem ampliada 4x — antes da remoção de fundo")

        # 3. rembg — remoção de fundo
        emit(arte_id, "progress", message="✂️ Recortando Fundo (rembg IA)…", percent=60)
        saida_pil = remove(up_pil)  # retorna RGBA
        score_arr = list(saida_pil.split()[3].getdata())
        pixels_validos = sum(1 for a in score_arr if a > 10)
        score = round(pixels_validos / max(len(score_arr), 1), 3)

        emit(arte_id, "progress",
             message=f"✅ Fundo removido — confiança {score * 100:.0f}%", percent=80)

        # Preview com fundo removido (exibe transparência como cinza xadrez no frontend)
        emit(arte_id, "preview",
             image=img_pil_to_b64(saida_pil, max_dim=700),
             label=f"Fundo removido — confiança {score * 100:.0f}%")

        # 4. Salva PNG 300 DPI
        emit(arte_id, "progress", message="💾 Gerando PNG 300 DPI…", percent=88)
        buf = io.BytesIO()
        saida_pil.save(buf, format="PNG", dpi=(300, 300))
        png_final = buf.getvalue()

        # 5. Upload
        emit(arte_id, "progress", message="☁️ Enviando para o storage…", percent=94)
        nome_saida = f"dtf_{arte_id}.png"
        url_final = fazer_upload(nome_saida, png_final, "image/png")

        # 6. Atualiza banco
        status = "Concluido" if score >= 0.30 else "Revisao_Manual"
        supabase_client().table("artes_processadas").update({
            "status": status, "url_final": url_final,
            "score_confianca": score, "atualizado_em": "now()",
        }).eq("id", arte_id).execute()

        msg = "✅ PNG 300 DPI pronto!" if status == "Concluido" else "⚠️ Pronto — verificar fundo antes de produzir."
        emit(arte_id, "done", url_final=url_final, message=msg, score=score)

    except Exception as exc:
        print(f"[dtf] ERRO {arte_id}: {exc}")
        emit(arte_id, "error", message=str(exc)[:300])
        try:
            supabase_client().table("artes_processadas").update({
                "status": "Erro", "erro_mensagem": str(exc)[:400],
            }).eq("id", arte_id).execute()
        except: pass
        raise self.retry(exc=exc, countdown=60)
