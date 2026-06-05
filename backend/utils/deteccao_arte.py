import cv2
import numpy as np

LIMITE_CORES_SILK = 12


def detectar_complexidade(imagem_cv2) -> dict:
    img_rgb = cv2.cvtColor(imagem_cv2, cv2.COLOR_BGR2RGB)

    img_blur = cv2.GaussianBlur(img_rgb, (15, 15), 0)
    diferenca = cv2.absdiff(img_rgb, img_blur)
    variacao_media = np.mean(diferenca)
    tem_gradiente = variacao_media > 15

    pixels = img_rgb.reshape(-1, 3).astype(np.float32)
    amostra = pixels[::10]

    criterio = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, _, centros = cv2.kmeans(amostra, LIMITE_CORES_SILK, None, criterio, 3, cv2.KMEANS_RANDOM_CENTERS)
    num_cores = len(centros)

    adequada_silk = not tem_gradiente and num_cores <= LIMITE_CORES_SILK

    return {
        "adequada_silk": adequada_silk,
        "tem_gradiente": tem_gradiente,
        "num_cores_estimado": num_cores,
        "motivo_bloqueio": "Arte com gradiente ou muitas cores — inadequada para silk screen" if not adequada_silk else None
    }
