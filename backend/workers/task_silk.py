"""
task_silk.py — Pipeline Silk Screen com streaming WebSocket
-------------------------------------------------------------
1. Download imagem original                → emit start
2. cv2.resize 2x (bicúbica)
3. cv2.bilateralFilter                     → emit preview (imagem limpa em Base64)
4. K-Means (quantização de cores)
5. Para cada cor isolada:
   - Máscara morfológica
   - Potrace → SVG                         → emit layer (miniatura da camada)
6. Monta SVG multi-camada
7. Upload para bucket-saida
8. Atualiza status no banco                → emit done
"""

import io, os, tempfile, subprocess, base64
import cv2
import numpy as np
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from dotenv import load_dotenv
load_dotenv()

from utils.supabase_client import supabase_client, atualizar_status, fazer_upload, salvar_task_id
from utils.ws_emit import emit, img_bgr_to_b64

BUCKET_SAIDA = os.getenv("BUCKET_SAIDA", "bucket-saida")


def _baixar_imagem(url: str) -> np.ndarray:
    import httpx
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    arr = np.frombuffer(resp.content, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Não foi possível decodificar a imagem")
    return img


def _cor_para_hex(bgr_cor) -> str:
    b, g, r = int(bgr_cor[0]), int(bgr_cor[1]), int(bgr_cor[2])
    return f"#{r:02x}{g:02x}{b:02x}"


def _gerar_svg_camada(mask_bin: np.ndarray, cor_hex: str, turdsize: int, lmm: float, hmm: float) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as f_pbm:
        pbm_path = f_pbm.name
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f_svg:
        svg_path = f_svg.name
    try:
        Image.fromarray(mask_bin).convert("1").save(pbm_path)
        subprocess.run([
            "potrace", "-s", pbm_path, "-o", svg_path,
            "--turdsize", str(turdsize),
            "--alphamax", "1.0",
            "--opttolerance", "0.3",
            "--width",  f"{lmm:.1f}mm",
            "--height", f"{hmm:.1f}mm",
        ], check=True, capture_output=True, timeout=60)
        with open(svg_path, "r", encoding="utf-8") as f:
            svg = f.read()
        svg = svg.replace('fill="#000000"', f'fill="{cor_hex}"')
        svg = svg.replace("fill:black", f"fill:{cor_hex}")
        return svg
    finally:
        for p in [pbm_path, svg_path]:
            try: os.unlink(p)
            except: pass


def _montar_svg_multicamada(camadas: list[dict], largura: int, altura: int) -> str:
    import re
    lmm = largura * 25.4 / 96
    hmm = altura  * 25.4 / 96
    grupos = []
    for cam in camadas:
        paths = re.findall(r'<path[^/]*/>', cam["svg"], re.DOTALL)
        paths += re.findall(r'<path[^>]*>.*?</path>', cam["svg"], re.DOTALL)
        cor = cam["cor"]
        g = f'  <g id="cor-{cor.strip("#")}" fill="{cor}" stroke="none">\n'
        g += "\n".join(f"    {p}" for p in paths)
        g += "\n  </g>"
        grupos.append(g)
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{lmm:.1f}mm" height="{hmm:.1f}mm" viewBox="0 0 {largura} {altura}">\n'
        f'  <!-- FBS Impressão — SVG Silk Screen em camadas -->\n'
        + "\n".join(grupos)
        + "\n</svg>"
    )


def _camada_preview_b64(img_bgr: np.ndarray, mask: np.ndarray, cor_hex: str) -> str:
    """Gera miniatura colorida da camada isolada para streaming."""
    r_val = int(cor_hex[1:3], 16)
    g_val = int(cor_hex[3:5], 16)
    b_val = int(cor_hex[5:7], 16)
    overlay = np.zeros_like(img_bgr)
    overlay[mask > 0] = [b_val, g_val, r_val]
    return img_bgr_to_b64(overlay, max_dim=400, quality=65)


@shared_task(bind=True, name="task_silk", max_retries=2,
             soft_time_limit=180, time_limit=200)
def processar_silk(self, arte_id: str, url_original: str, num_cores: int = 4,
                   blur_level: int = 3, turdsize: int = 2):
    try:
        atualizar_status(arte_id, "Processando")
        salvar_task_id(arte_id, self.request.id)   # persiste task_id para cancelamento
        emit(arte_id, "start", message="⚙️ Iniciando pipeline Silk Screen…")

        # 1. Download
        emit(arte_id, "progress", message="📥 Baixando imagem original…", percent=5)
        img_bgr = _baixar_imagem(url_original)
        h, w = img_bgr.shape[:2]

        # 2. Resize 2x bicúbica
        emit(arte_id, "progress", message="🔍 Ampliando resolução (2x)…", percent=15)
        img_bgr = cv2.resize(img_bgr, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        h, w = img_bgr.shape[:2]

        # 3. Bilateral filter — streaming da imagem limpa
        emit(arte_id, "progress", message="🧹 Aplicando filtro bilateral…", percent=25)
        d = max(1, blur_level if blur_level % 2 == 1 else blur_level + 1)
        img_filtrada = cv2.bilateralFilter(img_bgr, d=d, sigmaColor=75, sigmaSpace=75)

        # Envia preview da imagem limpa (antes da separação de cores)
        emit(arte_id, "preview",
             image=img_bgr_to_b64(img_filtrada, max_dim=700),
             label="Imagem filtrada — pronta para separação de cores")

        # 4. K-Means
        emit(arte_id, "progress", message=f"🎨 Separando {num_cores} cores (K-Means)…", percent=35)
        pixels = img_filtrada.reshape(-1, 3).astype(np.float32)
        kmeans = MiniBatchKMeans(n_clusters=num_cores, random_state=42, n_init=3)
        labels = kmeans.fit_predict(pixels)
        centros = kmeans.cluster_centers_.astype(np.uint8)

        # 5. Por camada → potrace → miniatura streaming
        lmm = w * 25.4 / 96
        hmm = h * 25.4 / 96
        camadas = []
        base_pct = 40
        step_pct = int(50 / num_cores)

        for idx in range(num_cores):
            pct = base_pct + idx * step_pct
            cor_hex = _cor_para_hex(centros[idx])
            emit(arte_id, "progress",
                 message=f"✏️ Vetorizando camada {idx + 1}/{num_cores} ({cor_hex})…",
                 percent=pct)

            mask = (labels.reshape(h, w) == idx).astype(np.uint8) * 255
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

            # Envia miniatura da camada ao vivo
            emit(arte_id, "layer",
                 image=_camada_preview_b64(img_filtrada, mask, cor_hex),
                 label=f"Camada {idx + 1}/{num_cores} — {cor_hex}",
                 index=idx + 1,
                 total=num_cores,
                 color=cor_hex)

            try:
                svg_cam = _gerar_svg_camada(mask, cor_hex, turdsize, lmm, hmm)
                camadas.append({"cor": cor_hex, "svg": svg_cam})
            except Exception as e:
                print(f"[silk] Camada {idx} falhou: {e}")

        if not camadas:
            raise RuntimeError("Nenhuma camada vetorizada com sucesso")

        # 6. Monta SVG multi-camada
        emit(arte_id, "progress", message="🗂️ Montando SVG multi-camada…", percent=92)
        svg_final = _montar_svg_multicamada(camadas, w, h)

        # 7. Upload
        emit(arte_id, "progress", message="☁️ Enviando para o storage…", percent=96)
        nome_saida = f"silk_{arte_id}.svg"
        url_final = fazer_upload(nome_saida, svg_final.encode("utf-8"), "image/svg+xml")

        # 8. Atualiza banco
        supabase_client().table("artes_processadas").update({
            "status": "Concluido", "url_final": url_final,
            "blur_level": blur_level, "turdsize": turdsize, "atualizado_em": "now()",
        }).eq("id", arte_id).execute()

        emit(arte_id, "done",
             url_final=url_final,
             message=f"✅ SVG pronto com {len(camadas)} camadas de cor!")

    except SoftTimeLimitExceeded:
        msg = "Timeout: Silk excedeu 3 minutos. Tente com imagem menor ou menos cores."
        print(f"[silk] TIMEOUT {arte_id}")
        emit(arte_id, "error", message=f"⏱ {msg}")
        try:
            supabase_client().table("artes_processadas").update({
                "status": "Erro (Timeout)", "erro_mensagem": msg,
            }).eq("id", arte_id).execute()
        except: pass

    except Exception as exc:
        print(f"[silk] ERRO {arte_id}: {exc}")
        emit(arte_id, "error", message=str(exc)[:300])
        try:
            supabase_client().table("artes_processadas").update({
                "status": "Erro", "erro_mensagem": str(exc)[:400],
            }).eq("id", arte_id).execute()
        except: pass
        raise self.retry(exc=exc, countdown=30)
