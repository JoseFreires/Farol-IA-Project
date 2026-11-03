from __future__ import annotations

import heapq
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from src.farol.contratos import MensagemSaida, Prioridade


@dataclass(order=True)
class EntradaSaida:
    prioridade: int
    expiracao: float
    seq: int = field(compare=False)
    msg: MensagemSaida = field(compare=False)


@dataclass
class ResultadoFrame:
    concluido: threading.Event = field(default_factory=threading.Event)
    processado: bool = False
    tarefas_pendentes: int = 0
    mensagens: list[MensagemSaida] = field(default_factory=list)
    abandonado: bool = False


class FilaSaida:
    def __init__(self):
        self._heap: list[tuple[int, float, int, EntradaSaida]] = []
        self._lock = threading.Lock()
        self._seq = 0
        self._frames: dict[int, ResultadoFrame] = {}

    def _proximo_seq(self) -> int:
        self._seq += 1
        return self._seq

    def registrar_frame(self, frame_id: int) -> None:
        with self._lock:
            self._frames[frame_id] = ResultadoFrame()

    def iniciar_tarefa_frame(self, frame_id: int) -> Callable[[], None]:
        with self._lock:
            resultado = self._frames.get(frame_id)
            if resultado is None:
                return lambda: None
            resultado.tarefas_pendentes += 1

        concluida = False

        def concluir() -> None:
            nonlocal concluida
            with self._lock:
                if concluida:
                    return
                concluida = True
                atual = self._frames.get(frame_id)
                if atual is None:
                    return
                atual.tarefas_pendentes -= 1
                self._sinalizar_frame(frame_id, atual)

        return concluir

    def finalizar_frame(self, frame_id: int) -> None:
        with self._lock:
            resultado = self._frames.get(frame_id)
            if resultado is None:
                return
            resultado.processado = True
            self._sinalizar_frame(frame_id, resultado)

    def descartar_frame(self, frame_id: int) -> None:
        with self._lock:
            self._frames.pop(frame_id, None)
            self._remover_mensagens_frame(frame_id)

    def aguardar_frame(
        self, frame_id: int, timeout: float
    ) -> list[MensagemSaida] | None:
        with self._lock:
            resultado = self._frames.get(frame_id)
        if resultado is None or not resultado.concluido.wait(timeout):
            with self._lock:
                resultado = self._frames.get(frame_id)
                if resultado is not None:
                    resultado.abandonado = True
                    self._limpar_frame_abandonado(frame_id, resultado)
            return None

        with self._lock:
            resultado = self._frames.pop(frame_id, None)
            if resultado is None:
                return []
            self._remover_mensagens_frame(frame_id)
            return resultado.mensagens

    def _sinalizar_frame(self, frame_id: int, resultado: ResultadoFrame) -> None:
        if resultado.processado and resultado.tarefas_pendentes == 0:
            resultado.concluido.set()
            self._limpar_frame_abandonado(frame_id, resultado)

    def _limpar_frame_abandonado(
        self, frame_id: int, resultado: ResultadoFrame
    ) -> None:
        if resultado.abandonado and resultado.processado and resultado.tarefas_pendentes == 0:
            self._frames.pop(frame_id, None)
            self._remover_mensagens_frame(frame_id)

    def _remover_mensagens_frame(self, frame_id: int) -> None:
        self._heap = [
            item for item in self._heap if item[3].msg.frameId != frame_id
        ]
        heapq.heapify(self._heap)

    def publicar(self, mensagem: MensagemSaida, *, interrompe: bool = False) -> None:
        with self._lock:
            resultado = self._frames.get(mensagem.frameId)
            if resultado is not None:
                if interrompe:
                    self._heap = [
                        item
                        for item in self._heap
                        if item[3].msg.prioridade != Prioridade.INFORMATIVA
                    ]
                    heapq.heapify(self._heap)
                resultado.mensagens.append(mensagem)
                return
            if interrompe:
                self._heap = [
                    item for item in self._heap if item[3].msg.prioridade != Prioridade.INFORMATIVA
                ]
            entrada = EntradaSaida(
                prioridade=int(mensagem.prioridade),
                expiracao=mensagem.timestamp + (mensagem.expiraEmMs / 1000.0),
                seq=self._proximo_seq(),
                msg=mensagem,
            )
            heapq.heappush(self._heap, (entrada.prioridade, entrada.expiracao, entrada.seq, entrada))

    def proxima(self, agora: float | None = None) -> MensagemSaida | None:
        agora = time.time() if agora is None else agora
        with self._lock:
            while self._heap:
                _, _, _, entrada = heapq.heappop(self._heap)
                if entrada.msg.expirada(agora):
                    continue
                return entrada.msg
            return None

    def vazia(self) -> bool:
        with self._lock:
            return not self._heap
