from __future__ import annotations

import heapq
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from src.farol.contratos import MensagemSaida, Prioridade


@dataclass(order=True)
class EntradaSaida:
    prioridade: int
    expiracao: float
    seq: int = field(compare=False)
    msg: MensagemSaida = field(compare=False)


class FilaSaida:
    def __init__(self):
        self._heap: list[tuple[int, float, int, EntradaSaida]] = []
        self._lock = threading.Lock()
        self._seq = 0

    def _proximo_seq(self) -> int:
        self._seq += 1
        return self._seq

    def publicar(self, mensagem: MensagemSaida, *, interrompe: bool = False) -> None:
        with self._lock:
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
