from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass

from src.farol.contratos import MensagemSaida, Motivo, Origem, Prioridade


_sequencia = 0
_sequencia_lock = threading.Lock()


def sequencia() -> int:
    global _sequencia
    with _sequencia_lock:
        _sequencia += 1
        return _sequencia


def normalizar_para_tts(texto: str) -> str:
    if not texto:
        return ""
    t = re.sub(r"\s+", " ", texto).strip()
    t = re.sub(r"(?<!bem )\bà frente\b", "bem à sua frente", t, flags=re.IGNORECASE)
    t = re.sub(r"\bbem bem à sua frente\b", "bem à sua frente", t, flags=re.IGNORECASE)
    t = re.sub(r"\bà esquerda\b", "à sua esquerda", t, flags=re.IGNORECASE)
    t = re.sub(r"\bà direita\b", "à sua direita", t, flags=re.IGNORECASE)
    return t


def _base(session_id: str, mensagem: str, *, prioridade: Prioridade, motivo: str | Motivo, origem: Origem | str, frame_id: int | None, expira_ms: int, interrompe: bool = False, eventos: list[dict] | None = None, deve_falar: bool = True) -> MensagemSaida:
    return MensagemSaida(
        sessionId=session_id,
        frameId=frame_id,
        timestamp=time.time(),
        expiraEmMs=expira_ms,
        prioridade=prioridade,
        motivo=motivo,
        origem=origem,
        mensagem=normalizar_para_tts(mensagem),
        deveFalar=deve_falar,
        interrompe=interrompe,
        eventos=eventos or [],
    )


def msg_risco(r, frame_id: int | None, session_id: str = "session-1", expira_ms_risco: int = 3000) -> MensagemSaida:
    return _base(
        session_id,
        getattr(r, "mensagem", str(r)),
        prioridade=Prioridade.CRITICA,
        motivo=Motivo.RISCO,
        origem=Origem.SOMENTE_YOLO,
        frame_id=frame_id,
        expira_ms=expira_ms_risco,
        interrompe=True,
    )


def msg_ambiente(
    texto: str,
    decisao,
    frame_id: int | None,
    session_id: str = "session-1",
    expira_ms_informativa: int = 4000,
    origem: Origem | str = Origem.VLM,
) -> MensagemSaida:
    return _base(
        session_id,
        texto,
        prioridade=Prioridade.INFORMATIVA,
        motivo=getattr(decisao, "motivo", Motivo.AMBIENTE),
        origem=origem,
        frame_id=frame_id,
        expira_ms=expira_ms_informativa,
    )


def msg_resposta(texto: str, origem: Origem | str, frame_id: int | None, session_id: str = "session-1", expira_ms_resposta: int = 8000) -> MensagemSaida:
    return _base(
        session_id,
        texto,
        prioridade=Prioridade.RESPOSTA,
        motivo=Motivo.RESPOSTA_PERGUNTA,
        origem=origem,
        frame_id=frame_id,
        expira_ms=expira_ms_resposta,
    )


def msg_erro(
    exc: Exception,
    session_id: str = "session-1",
    frame_id: int | None = None,
) -> MensagemSaida:
    texto = "Não consegui acessar o modelo de descrição."
    if exc is not None and str(exc):
        texto = str(exc)
    return _base(
        session_id,
        texto,
        prioridade=Prioridade.CRITICA,
        motivo=Motivo.ERRO,
        origem=Origem.ERRO,
        frame_id=frame_id,
        expira_ms=5000,
        deve_falar=True,
    )


def msg_silencio(frame_id: int | None, session_id: str = "session-1") -> MensagemSaida:
    return _base(
        session_id,
        "",
        prioridade=Prioridade.INFORMATIVA,
        motivo=Motivo.SILENCIO,
        origem=Origem.VLM,
        frame_id=frame_id,
        expira_ms=1000,
        deve_falar=False,
    )
