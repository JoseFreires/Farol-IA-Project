from __future__ import annotations

import cv2
import numpy as np


TAMANHO_FRAME = (128, 128)
TAMANHO_IMAGEM_COMPARACAO = 768
LIMIAR_INTENSIDADE_PIXEL = 0.08
LIMIAR_MUDANCA_LOCAL = 0.08
LIMIAR_MUDANCA_AMBIENTE = 0.45


def preparar_frame(imagem: bytes) -> np.ndarray | None:
    """Decodifica e reduz a imagem para uma representação compacta em tons de cinza."""
    if not imagem:
        return None

    decodificada = cv2.imdecode(np.frombuffer(imagem, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if decodificada is None:
        return None

    return cv2.resize(decodificada, TAMANHO_FRAME, interpolation=cv2.INTER_AREA)


def preparar_imagem_comparacao(imagem: bytes) -> bytes | None:
    if not imagem:
        return None

    decodificada = cv2.imdecode(np.frombuffer(imagem, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decodificada is None:
        return None

    altura, largura = decodificada.shape[:2]
    escala = min(1.0, TAMANHO_IMAGEM_COMPARACAO / max(altura, largura))
    if escala < 1.0:
        decodificada = cv2.resize(
            decodificada,
            (max(1, round(largura * escala)), max(1, round(altura * escala))),
            interpolation=cv2.INTER_AREA,
        )

    sucesso, codificada = cv2.imencode(
        ".jpg",
        decodificada,
        [cv2.IMWRITE_JPEG_QUALITY, 80],
    )
    return codificada.tobytes() if sucesso else None


def calcular_diferenca_visual(
    imagem_nova: bytes,
    imagem_anterior: np.ndarray | None,
) -> float:
    if imagem_anterior is None:
        return 1.0

    frame_novo = preparar_frame(imagem_nova)
    if frame_novo is None or imagem_anterior.shape != TAMANHO_FRAME:
        return 1.0

    diferenca = cv2.absdiff(frame_novo, imagem_anterior)
    pixels_alterados = diferenca >= round(LIMIAR_INTENSIDADE_PIXEL * 255)
    return float(np.mean(pixels_alterados))


def houve_mudanca_visual(
    imagem_nova: bytes,
    imagem_anterior: np.ndarray | None,
    limiar: float = LIMIAR_MUDANCA_LOCAL,
) -> bool:
    if not 0.0 <= limiar <= 1.0:
        raise ValueError("limiar deve estar entre 0.0 e 1.0")
    return calcular_diferenca_visual(imagem_nova, imagem_anterior) >= limiar
