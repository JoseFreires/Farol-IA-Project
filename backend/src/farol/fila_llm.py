from __future__ import annotations

import heapq
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from src.farol.skills import executar


logger = logging.getLogger(__name__)


@dataclass
class Tarefa:
    prioridade: int
    skill: dict[str, Any]
    variaveis: dict[str, Any]
    imagem: bytes | None = None
    modo: str = ""
    valida: Callable[[], bool] | None = None
    ao_concluir: Callable[[str], Any] | None = None
    ao_erro: Callable[[Exception], Any] | None = None
    cancelar: threading.Event | None = None
    seq: int = field(default=0)
    criado_em: float = field(default_factory=time.time)


class FilaLLM:
    def __init__(self, chat=None):
        self._heap: list[tuple[int, int, Tarefa]] = []
        self._lock = threading.Lock()
        self._em_execucao: Tarefa | None = None
        self._parar = threading.Event()
        self._thread = threading.Thread(target=self.loop, name="T_vlm", daemon=True)
        self._thread.start()
        self._chat = chat
        self._seq = 0

    def _proximo_seq(self) -> int:
        self._seq += 1
        return self._seq

    def enfileirar(
        self,
        skill: dict[str, Any],
        variaveis: dict[str, Any],
        prioridade: int = 2,
        imagem: bytes | None = None,
        modo: str = "",
        valida: Callable[[], bool] | None = None,
        ao_concluir: Callable[[str], Any] | None = None,
        ao_erro: Callable[[Exception], Any] | None = None,
        cancelar: threading.Event | None = None,
    ) -> Tarefa:
        tarefa = Tarefa(
            prioridade=prioridade,
            skill=skill,
            variaveis=variaveis,
            imagem=imagem,
            modo=modo,
            valida=valida,
            ao_concluir=ao_concluir,
            ao_erro=ao_erro,
            cancelar=cancelar or threading.Event(),
            seq=self._proximo_seq(),
        )
        with self._lock:
            heapq.heappush(self._heap, (tarefa.prioridade, tarefa.seq, tarefa))
        return tarefa

    def ocupada_com(self, prioridade: int) -> bool:
        with self._lock:
            if self._em_execucao is not None and self._em_execucao.prioridade == prioridade:
                return True
            return any(tarefa.prioridade == prioridade for _, _, tarefa in self._heap)

    def cancelar_tudo(self) -> None:
        with self._lock:
            for _, _, tarefa in self._heap:
                tarefa.cancelar.set()
            if self._em_execucao is not None:
                self._em_execucao.cancelar.set()

    def parar(self) -> None:
        self._parar.set()

    def _lancar_task(self, tarefa: Tarefa) -> str | None:
        if tarefa.valida is not None and not tarefa.valida():
            logger.info("descartando tarefa antiga de prioridade=%s skill=%s", tarefa.prioridade, tarefa.skill.get("name"))
            return None

        try:
            resultado = executar(
                skill=tarefa.skill,
                variaveis=tarefa.variaveis,
                imagem=tarefa.imagem,
                modo=tarefa.modo,
                cancelar=tarefa.cancelar,
                chat=self._chat or __import__("ollama").chat,
            )
            if resultado is None:
                logger.info("tarefa cancelada: %s", tarefa.skill.get("name"))
                return None
            return resultado
        except Exception as exc:
            if tarefa.ao_erro is not None:
                try:
                    tarefa.ao_erro(exc)
                except Exception:
                    logger.exception("callback ao_erro falhou para skill=%s", tarefa.skill.get("name"))
            raise

    def loop(self) -> None:
        while not self._parar.is_set():
            with self._lock:
                if not self._heap:
                    time.sleep(0.02)
                    continue
                _, _, tarefa = heapq.heappop(self._heap)
                self._em_execucao = tarefa
            try:
                texto = self._lancar_task(tarefa)
                if texto is not None and tarefa.ao_concluir is not None:
                    try:
                        tarefa.ao_concluir(texto)
                    except Exception:
                        logger.exception("callback ao_concluir falhou para skill=%s", tarefa.skill.get("name"))
            except Exception as exc:
                logger.exception("erro ao processar tarefa de skill=%s", tarefa.skill.get("name"))
                if tarefa.ao_erro is not None:
                    try:
                        tarefa.ao_erro(exc)
                    except Exception:
                        logger.exception("callback ao_erro falhou para skill=%s", tarefa.skill.get("name"))
            finally:
                with self._lock:
                    self._em_execucao = None
                time.sleep(0.01)
