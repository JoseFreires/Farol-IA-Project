import cv2
import numpy as np

from src.farol.contratos import Deteccao
from src.farol.risco.identificar_risco import RiscoDetectado
from src.farol.visualizacao import EstadoVisualizacao, desenhar_deteccoes, mostrar_frame


def test_desenhar_deteccoes_marca_caixas_e_limita_tamanho():
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    deteccao = Deteccao(
        classe_yolo="refrigerator",
        conf=0.99,
        x1=20,
        y1=20,
        x2=100,
        y2=90,
        frame_width=200,
        frame_height=100,
    )

    resultado = desenhar_deteccoes(frame, [deteccao], max_lado=100)

    assert resultado.shape == (50, 100, 3)
    assert np.any(resultado != 0)
    assert np.all(frame == 0)


def test_visualizacao_destaca_risco():
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    deteccao = Deteccao(
        classe_yolo="knife",
        conf=0.9,
        x1=10,
        y1=10,
        x2=50,
        y2=50,
        frame_width=100,
        frame_height=100,
    )
    risco = RiscoDetectado(
        chave=1,
        classe_yolo="knife",
        classe_pt="faca",
        nivel="ATENCAO",
        area_rel=0.16,
        horizontal="à esquerda",
        distancia="perto",
        mensagem="Atenção!",
    )

    resultado = desenhar_deteccoes(frame, [deteccao], [risco])

    assert tuple(resultado[10, 10]) == (0, 0, 255)


def test_mostrar_frame_exibe_paineis_de_objetos_e_fala(monkeypatch):
    chamadas = []
    janelas = []
    tamanhos_janelas = []
    monkeypatch.setattr("src.farol.visualizacao._janela_criada", False)
    monkeypatch.setattr(
        "src.farol.visualizacao.cv2.namedWindow",
        lambda *args: janelas.append(args),
    )
    monkeypatch.setattr(
        "src.farol.visualizacao.cv2.resizeWindow",
        lambda *args: tamanhos_janelas.append(args),
    )
    monkeypatch.setattr("src.farol.visualizacao.cv2.waitKey", lambda *_: -1)
    monkeypatch.setattr(
        "src.farol.visualizacao.cv2.getWindowProperty", lambda *_: 1
    )
    monkeypatch.setattr(
        "src.farol.visualizacao.cv2.imshow",
        lambda titulo, imagem: chamadas.append(imagem.copy()),
    )

    tecla = mostrar_frame(
        np.zeros((180, 400, 3), dtype=np.uint8),
        12,
        [],
        resumo_objetos="uma cadeira à esquerda",
        fala="Há uma cadeira à esquerda.",
    )

    assert tecla == 255
    assert janelas == [("Farol - analise ao vivo", cv2.WINDOW_NORMAL)]
    assert tamanhos_janelas == [("Farol - analise ao vivo", 400, 180)]
    assert np.any(chamadas[0][0:50] != 0)
    assert np.any(chamadas[0][-50:] != 0)


def test_estado_visualizacao_atualiza_ultima_fala():
    estado = EstadoVisualizacao()

    estado.registrar_fala("Nova descrição")

    assert estado.ultima_fala() == "Nova descrição"
