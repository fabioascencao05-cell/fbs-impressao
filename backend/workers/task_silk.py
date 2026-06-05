"""
task_silk.py — Pipeline Silk Screen
------------------------------------
1. Download imagem original
2. cv2.resize (bicúbica, 2x)
3. cv2.bilateralFilter (suavização preservando bordas)
4. K-Means (quantização de cores)
5. Para cada cor isolada → potrace → SVG
6. Monta SVG multi-camada
7. Upload para bucket-saida
8. Atualiza status no banco
"""

import io, os, time, tempfile, subprocess
import cv2
import numpy as np
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
from celery import shared_task
from dotenv import load_dotenv
load_dotenv()

from utils.supabase_client import supabase_client, atualizar_status, fazer_upload

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


def _gerar_svg_camada(mask_bin: np.ndarray, cor_hex: str, turdsize: int, largura_mm: float, altura_mm: float) -> str:
    """Vetoriza uma máscara binária com Potrace e retorna o conteúdo SVG da camada."""
    with tempfile.NamedTemporaryFile(suffix=".pbm", delete=False) as f_pbm:
        pbm_path = f_pbm.name
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f_svg:
        svg_path = f_svg.name

    try:
        pil_mask = Image.fromarray(mask_bin).convert("1")
        pil_mask.save(pbm_path)

        cmd = [
            "potrace", "-s",                          # saída SVG
            pbm_path, "-o", svg_path,
            "--turdsize", str(turdsize),              # remove manchas pequenas
            "--alphamax", "1.0",                      # cantos suaves
            "--opttolerance", "0.3",                  # tolerância de curva
            "--width",  f"{largura_mm:.1f}mm",
            "--height", f"{altura_mm:.1f}mm",
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)

        with open(svg_path, "r", encoding="utf-8") as f:
            svg_content = f.read()

        # Troca fill preto pela cor real da camada
        svg_content = svg_content.replace('fill="#000000"', f'fill="{cor_hex}"')
        svg_content = svg_content.replace("fill:black", f"fill:{cor_hex}")
        svg_content = svg_content.replace("fill:rgb(0,0,0)", f"fill:{cor_hex}")

        return svg_content
    finally:
        for p in [pbm_path, svg_path]:
            try: os.unlink(p)
            except: pass


def _montar_svg_multicamada(camadas: list[dict], largura: int, altura: int) -> str:
    """Monta um SVG único com cada cor em seu próprio <g> (camada)."""
    # DPI de referência: 96px = 1in = 25.4mm
    lmm = largura * 25.4 / 96
    hmm = altura  * 25.4 / 96

    grupos = []
    for cam in camadas:
        # Extrai o <path> do SVG individual e coloca num <g> identificado
        import re
        paths = re.findall(r'<path[^/]*/>', cam["svg"], re.DOTALL)
        paths += re.findall(r'<path[^>]*>.*?</path>', cam["svg"], re.DOTALL)
        cor = cam["cor"]
        grupo = f'  <g id="cor-{cor.strip("#")}" fill="{cor}" stroke="none">\n'
        grupo += "\n".join(f"    {p}" for p in paths)
        grupo += "\n  </g>"
        grupos.append(grupo)

    svg = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{lmm:.1f}mm" height="{hmm:.1f}mm" '
        f'viewBox="0 0 {largura} {altura}">\n'
        f'  <!-- FBS Vetor — SVG em camadas para Silk Screen -->\n'
    )
    svg += "\n".join(grupos)
    svg += "\n</svg>"
    return svg


@shared_task(bind=True, name="task_silk", max_retries=2)
def processar_silk(self, arte_id: str, url_original: str, num_cores: int = 4,
                   blur_level: int = 3, turdsize: int = 2):
    try:
        atualizar_status(arte_id, "Processando")

        # 1. Download
        img_bgr = _baixar_imagem(url_original)
        h, w = img_bgr.shape[:2]

        # 2. Resize 2x (bicúbica) para preservar detalhe
        img_bgr = cv2.resize(img_bgr, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        h, w = img_bgr.shape[:2]

        # 3. Bilateral filter (suavização preserva bordas)
        # blur_level controla o diâmetro (1=fino, 9=máximo)
        d = max(1, blur_level if blur_level % 2 == 1 else blur_level + 1)
        img_filtrada = cv2.bilateralFilter(img_bgr, d=d, sigmaColor=75, sigmaSpace=75)

        # 4. K-Means — quantização de cores
        pixels = img_filtrada.reshape(-1, 3).astype(np.float32)
        kmeans = MiniBatchKMeans(n_clusters=num_cores, random_state=42, n_init=3)
        labels = kmeans.fit_predict(pixels)
        centros = kmeans.cluster_centers_.astype(np.uint8)

        # 5. Para cada cor → máscara → potrace → SVG
        lmm = w * 25.4 / 96
        hmm = h * 25.4 / 96
        camadas = []
        for idx in range(num_cores):
            mask = (labels.reshape(h, w) == idx).astype(np.uint8) * 255
            # Remove ruído da máscara antes de vetorizar
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

            cor_hex = _cor_para_hex(centros[idx])
            try:
                svg_cam = _gerar_svg_camada(mask, cor_hex, turdsize, lmm, hmm)
                camadas.append({"cor": cor_hex, "svg": svg_cam})
            except Exception as e:
                print(f"[silk] Camada {idx} ({cor_hex}) falhou: {e}")

        if not camadas:
            raise RuntimeError("Nenhuma camada vetorizada com sucesso")

        # 6. Monta SVG multi-camada
        svg_final = _montar_svg_multicamada(camadas, w, h)

        # 7. Upload para Supabase
        nome_saida = f"silk_{arte_id}.svg"
        url_final = fazer_upload(nome_saida, svg_final.encode("utf-8"), "image/svg+xml")

        # 8. Atualiza banco
        supabase_client().table("artes_processadas").update({
            "status": "Concluido",
            "url_final": url_final,
            "blur_level": blur_level,
            "turdsize": turdsize,
            "atualizado_em": "now()",
        }).eq("id", arte_id).execute()

    except Exception as exc:
        print(f"[silk] ERRO {arte_id}: {exc}")
        try:
            supabase_client().table("artes_processadas").update({
                "status": "Erro",
                "erro_mensagem": str(exc)[:400],
            }).eq("id", arte_id).execute()
        except: pass
        raise self.retry(exc=exc, countdown=30)
