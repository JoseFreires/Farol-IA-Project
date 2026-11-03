import io

import cv2
import numpy as np
from PIL import Image
from PIL import ImageDraw

from core.diff_visual import (
    calcular_diferenca_visual,
    houve_mudanca_visual,
    preparar_frame,
    preparar_imagem_comparacao,
)


def _jpeg(cor: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), cor).save(buffer, format="JPEG")
    return buffer.getvalue()


def _png(cor: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), cor).save(buffer, format="PNG")
    return buffer.getvalue()


def _png_metade_alterada() -> bytes:
    imagem = Image.new("RGB", (64, 64), "white")
    ImageDraw.Draw(imagem).rectangle((0, 0, 31, 63), fill="black")
    buffer = io.BytesIO()
    imagem.save(buffer, format="PNG")
    return buffer.getvalue()


def test_primeiro_frame_e_considerado_mudanca():
    assert houve_mudanca_visual(_jpeg((255, 255, 255)), None)
    assert calcular_diferenca_visual(_png((255, 255, 255)), None) == 1.0


def test_frames_identicos_nao_sao_mudanca():
    imagem = _jpeg((255, 255, 255))
    frame_anterior = preparar_frame(imagem)

    assert not houve_mudanca_visual(imagem, frame_anterior)


def test_mudanca_visual_acima_do_limiar_e_detectada():
    imagem_anterior = preparar_frame(_jpeg((255, 255, 255)))

    assert houve_mudanca_visual(_jpeg((0, 0, 0)), imagem_anterior)


def test_calcular_diferenca_visual_retorna_variacao_normalizada():
    anterior = preparar_frame(_png((255, 255, 255)))

    assert calcular_diferenca_visual(_png((0, 0, 0)), anterior) == 1.0
    assert calcular_diferenca_visual(_png_metade_alterada(), anterior) == 0.5


def test_imagem_invalida_nao_e_descartada():
    assert houve_mudanca_visual(b"imagem invalida", preparar_frame(_jpeg((0, 0, 0))))


def test_imagem_anterior_e_compactada_para_comparacao_semantica():
    imagem = preparar_imagem_comparacao(_jpeg((30, 90, 180)))

    assert imagem is not None
    decodificada = cv2.imdecode(np.frombuffer(imagem, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert max(decodificada.shape[:2]) <= 768
