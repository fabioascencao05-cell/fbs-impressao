from PIL import Image
import io

FORMATOS_PERMITIDOS = ['PNG', 'JPEG', 'TIFF']
TAMANHO_MINIMO_PX = 300
TAMANHO_MAXIMO_MB = 50


def validar_imagem(dados_bytes: bytes) -> dict:
    try:
        tamanho_mb = len(dados_bytes) / (1024 * 1024)
        if tamanho_mb > TAMANHO_MAXIMO_MB:
            return {"valido": False, "erro": f"Arquivo muito grande ({tamanho_mb:.1f}MB). Máximo: {TAMANHO_MAXIMO_MB}MB"}

        img = Image.open(io.BytesIO(dados_bytes))

        if img.format not in FORMATOS_PERMITIDOS:
            return {"valido": False, "erro": f"Formato {img.format} não suportado. Use PNG, JPG ou TIFF"}

        largura, altura = img.size
        if largura < TAMANHO_MINIMO_PX or altura < TAMANHO_MINIMO_PX:
            return {"valido": False, "erro": f"Imagem muito pequena ({largura}x{altura}px). Mínimo: {TAMANHO_MINIMO_PX}px"}

        return {"valido": True, "erro": None, "largura": largura, "altura": altura}

    except Exception as e:
        return {"valido": False, "erro": f"Arquivo corrompido ou inválido: {str(e)}"}
