from __future__ import annotations

import threading
import unicodedata
from typing import Sequence

import cv2
import numpy as np

from src.farol.contratos import Deteccao
from src.farol.filtro import CLASSES_PT, distancia, horizontal
from src.farol.risco.identificar_risco import RiscoDetectado


_TITULO_JANELA = "Farol - analise ao vivo"
_janela_criada = False


class EstadoVisualizacao:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ultima_fala = ""

    def registrar_fala(self, texto: str) -> None:
        with self._lock:
            self._ultima_fala = texto

    def ultima_fala(self) -> str:
        with self._lock:
            return self._ultima_fala


def _ascii(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()


def _quebrar_texto(texto: str, largura_maxima: int, escala: float) -> list[str]:
    palavras = _ascii(texto).split()
    linhas: list[str] = []
    linha = ""
    for palavra in palavras:
        candidata = f"{linha} {palavra}".strip()
        largura = cv2.getTextSize(
            candidata, cv2.FONT_HERSHEY_SIMPLEX, escala, 1
        )[0][0]
        if linha and largura > largura_maxima:
            linhas.append(linha)
            linha = palavra
        else:
            linha = candidata
    if linha:
        linhas.append(linha)
    if len(linhas) > 4:
        linhas = linhas[:4]
        linhas[-1] = linhas[-1].removesuffix("...") + "..."
    return linhas


def _desenhar_painel(
    frame: np.ndarray,
    texto: str,
    *,
    topo: bool,
    cor_texto: tuple[int, int, int],
) -> None:
    altura, largura = frame.shape[:2]
    margem = 12
    escala = 0.62
    linhas = _quebrar_texto(texto, largura - margem * 2 - 12, escala)
    if not linhas:
        return

    espacamento = 27
    painel_altura = margem + espacamento * len(linhas) + 4
    y1 = 0 if topo else max(0, altura - painel_altura)
    y2 = min(altura - 1, y1 + painel_altura)
    fundo = frame.copy()
    cv2.rectangle(fundo, (0, y1), (largura - 1, y2), (0, 0, 0), cv2.FILLED)
    cv2.addWeighted(fundo, 0.68, frame, 0.32, 0, frame)

    for indice, linha in enumerate(linhas):
        y = y1 + margem + (indice + 1) * espacamento - 5
        cv2.putText(
            frame,
            linha,
            (margem, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            escala,
            cor_texto,
            1,
            cv2.LINE_AA,
        )


def desenhar_deteccoes(
    frame: np.ndarray,
    deteccoes: Sequence[Deteccao],
    riscos: Sequence[RiscoDetectado] = (),
    max_lado: int = 1280,
) -> np.ndarray:
    visualizacao = frame.copy()
    chaves_risco = {(risco.classe_yolo, risco.horizontal) for risco in riscos}
    altura, largura = visualizacao.shape[:2]

    for deteccao in deteccoes:
        x1 = max(0, min(largura - 1, round(deteccao.x1)))
        y1 = max(0, min(altura - 1, round(deteccao.y1)))
        x2 = max(0, min(largura - 1, round(deteccao.x2)))
        y2 = max(0, min(altura - 1, round(deteccao.y2)))
        if x2 <= x1 or y2 <= y1:
            continue

        cx = (deteccao.x1 + deteccao.x2) / 2
        posicao = horizontal(cx, largura)
        area_rel = deteccao.area_rel or (
            max(0.0, x2 - x1) * max(0.0, y2 - y1) / (largura * altura)
        )
        alcance = distancia(area_rel)
        chave_risco = (deteccao.classe_yolo, posicao)
        cor = (0, 0, 255) if chave_risco in chaves_risco else (0, 220, 0)
        classe = CLASSES_PT.get(deteccao.classe_yolo.lower(), deteccao.classe_yolo)
        rotulo = _ascii(
            f"{classe} {deteccao.conf:.2f} | {posicao} | {alcance}"
        )

        cv2.rectangle(visualizacao, (x1, y1), (x2, y2), cor, 2)
        (largura_texto, altura_texto), base = cv2.getTextSize(
            rotulo, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
        )
        topo_rotulo = max(0, y1 - altura_texto - base - 6)
        cv2.rectangle(
            visualizacao,
            (x1, topo_rotulo),
            (min(largura - 1, x1 + largura_texto + 8), y1),
            cor,
            cv2.FILLED,
        )
        cv2.putText(
            visualizacao,
            rotulo,
            (x1 + 4, max(altura_texto, y1 - base - 3)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    if max_lado > 0 and max(largura, altura) > max_lado:
        escala = max_lado / max(largura, altura)
        visualizacao = cv2.resize(
            visualizacao,
            (round(largura * escala), round(altura * escala)),
            interpolation=cv2.INTER_AREA,
        )
    return visualizacao


def mostrar_frame(
    frame: np.ndarray,
    frame_id: int,
    deteccoes: Sequence[Deteccao],
    riscos: Sequence[RiscoDetectado] = (),
    max_lado: int = 1280,
    resumo_objetos: str = "",
    fala: str = "",
) -> int:
    global _janela_criada
    visualizacao = desenhar_deteccoes(frame, deteccoes, riscos, max_lado)
    if not _janela_criada:
        cv2.namedWindow(_TITULO_JANELA, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(
            _TITULO_JANELA, visualizacao.shape[1], visualizacao.shape[0]
        )
        _janela_criada = True

    cabecalho = f"Frame {frame_id} | {len(deteccoes)} deteccoes"
    if resumo_objetos:
        cabecalho = f"Objetos: {resumo_objetos} | {cabecalho}"
    _desenhar_painel(visualizacao, cabecalho, topo=True, cor_texto=(0, 220, 255))
    if fala:
        _desenhar_painel(
            visualizacao, f"Fala: {fala}", topo=False, cor_texto=(255, 255, 255)
        )
    cv2.imshow(_TITULO_JANELA, visualizacao)
    tecla = cv2.waitKey(1) & 0xFF
    if cv2.getWindowProperty(_TITULO_JANELA, cv2.WND_PROP_VISIBLE) < 1:
        return ord("q")
    return tecla
