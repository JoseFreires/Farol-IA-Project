from __future__ import annotations

import base64
import logging
from dataclasses import dataclass, field, replace
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import numpy as np

from core.diff_visual import (
    LIMIAR_MUDANCA_AMBIENTE,
    LIMIAR_MUDANCA_LOCAL,
    calcular_diferenca_visual,
    preparar_frame,
    preparar_imagem_comparacao,
)
from app.config import settings
from agent_runtime import (
    ExecutorRegistry,
    MarkdownLoader,
    OllamaClient,
    OllamaConfig,
    OllamaSkillExecutor,
    AgentRuntime,
    SkillExecutor,
    SkillRegistry,
)
from rules.rules import (
    AnalysisData,
    ProcessingDecision,
    SessionMemory,
    Rules,
    RulesConfig,
    AnalysisError,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ProcessingRequest:
    session_id: str
    imagem: bytes
    pergunta: str | None = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    imagem_anterior: bytes | None = field(default=None, repr=False, compare=False)
    skill_override: Literal["describe-environment", "identify-change"] | None = field(
        default=None,
        repr=False,
        compare=False,
    )


@dataclass(frozen=True, slots=True)
class ProcessingResult:
    session_id: str
    status: str
    deve_falar: bool
    mensagem: str | None
    prioridade: str
    idioma: str = "pt-BR"
    fallback: bool = False
    motivo: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "status": self.status,
            "deveFalar": self.deve_falar,
            "mensagem": self.mensagem,
            "prioridade": self.prioridade,
            "idioma": self.idioma,
            "fallback": self.fallback,
            "motivo": self.motivo,
        }


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, dict[str, Any]] = {}
        self._frames: dict[str, np.ndarray] = {}
        self._images: dict[str, bytes] = {}

    def obter_frame(self, session_id: str) -> np.ndarray | None:
        return self._frames.get(session_id)

    def atualizar_frame(self, session_id: str, frame: np.ndarray) -> None:
        self._frames[session_id] = frame

    def obter_imagem(self, session_id: str) -> bytes | None:
        return self._images.get(session_id)

    def atualizar_imagem(self, session_id: str, imagem: bytes) -> None:
        self._images[session_id] = imagem

    def obter_memoria(self, session_id: str) -> SessionMemory:
        sessao = self._sessions.setdefault(session_id, {})
        memoria = sessao.get("analysis")
        if memoria is None:
            memoria = SessionMemory()
            sessao["analysis"] = memoria
        return memoria

    def resetar_contexto_espacial(self, session_id: str) -> None:
        self._sessions[session_id]["analysis"] = SessionMemory()

    def atualizar_memoria(self, session_id: str, dados: AnalysisData, decisao: ProcessingDecision) -> SessionMemory:
        memoria = self.obter_memoria(session_id)
        if decisao.eventos_anunciados:
            eventos_recentes = decisao.eventos_anunciados
        else:
            eventos_recentes = tuple(
                evento
                for evento in memoria.eventos_recentes
                if evento in dados.eventos
            )
        proxima = SessionMemory(
            descricao_inicial_realizada=memoria.descricao_inicial_realizada or bool(dados.descricao),
            ultima_descricao=dados.descricao or memoria.ultima_descricao,
            ultima_mensagem=decisao.mensagem if decisao.deve_falar else memoria.ultima_mensagem,
            ultima_fala_em=datetime.utcnow() if decisao.deve_falar else memoria.ultima_fala_em,
            motivos_recentes=memoria.motivos_recentes,
            eventos_recentes=eventos_recentes,
        )
        self._sessions[session_id]["analysis"] = proxima
        return proxima


def _build_runtime() -> AgentRuntime:
    root = Path(__file__).resolve().parent.parent
    markdown_loader = MarkdownLoader(allowed_roots=(root / "skills",))
    skill_registry = SkillRegistry(root / "skills", markdown_loader)
    skill_registry.discover()

    ollama_client = OllamaClient(
        OllamaConfig(
            base_url=settings.ollama_host,
            model=settings.ollama_model,
            keep_alive=settings.ollama_keep_alive,
        )
    )
    ollama_executor = OllamaSkillExecutor(ollama_client)
    executor_registry = ExecutorRegistry()
    executor_registry.register("ollama", ollama_executor)

    skill_executor = SkillExecutor(skill_registry=skill_registry, executor_registry=executor_registry)
    return AgentRuntime(skill_executor=skill_executor)


class Processor:
    def __init__(
        self,
        session_manager: SessionManager | None = None,
        runtime: Any | None = None,
        rules: Rules | None = None,
    ) -> None:
        self.session_manager = session_manager or SessionManager()
        self.runtime = runtime or _build_runtime()
        self.rules = rules or Rules(RulesConfig())

    async def processar(self, solicitacao: ProcessingRequest) -> ProcessingResult:
        memoria = self.session_manager.obter_memoria(solicitacao.session_id)
        frame_anterior = self.session_manager.obter_frame(solicitacao.session_id)
        diferenca_visual = (
            calcular_diferenca_visual(solicitacao.imagem, frame_anterior)
            if frame_anterior is not None
            else None
        )

        if (
            not solicitacao.pergunta
            and diferenca_visual is not None
            and diferenca_visual < LIMIAR_MUDANCA_LOCAL
        ):
            return ProcessingResult(
                session_id=solicitacao.session_id,
                status="ok",
                deve_falar=False,
                mensagem=None,
                prioridade="NENHUMA",
                motivo="SEM_MUDANCA_VISUAL",
            )

        frame_atual = preparar_frame(solicitacao.imagem)
        imagem_atual = preparar_imagem_comparacao(solicitacao.imagem)
        mudanca_drastica = (
            diferenca_visual is not None
            and diferenca_visual >= LIMIAR_MUDANCA_AMBIENTE
        )
        skill_override: Literal["describe-environment", "identify-change"] | None = None
        if mudanca_drastica:
            self.session_manager.resetar_contexto_espacial(solicitacao.session_id)
            memoria = self.session_manager.obter_memoria(solicitacao.session_id)
            skill_override = "describe-environment"
        elif not solicitacao.pergunta and frame_anterior is None:
            skill_override = "describe-environment"
        elif not solicitacao.pergunta and diferenca_visual is not None:
            skill_override = "identify-change"

        solicitacao_runtime = replace(
            solicitacao,
            pergunta=None if mudanca_drastica else solicitacao.pergunta,
            imagem_anterior=(
                None
                if mudanca_drastica
                else self.session_manager.obter_imagem(solicitacao.session_id)
            ),
            skill_override=skill_override,
        )
        dados = await self.runtime.processar(solicitacao_runtime, memoria)
        logger.info(
            "runtime AnalysisData session=%s eventos=%r descricao=%r "
            "resposta_semantica=%r confianca_geral=%r",
            solicitacao.session_id,
            dados.eventos,
            dados.descricao,
            dados.resposta_semantica,
            dados.confianca_geral,
        )
        if getattr(dados, "erro", None):
            raise AnalysisError(dados.erro)
        decisao = self.rules.avaliar(
            dados,
            memoria,
            None if mudanca_drastica else solicitacao.pergunta,
        )
        self.session_manager.atualizar_memoria(solicitacao.session_id, dados, decisao)
        if frame_atual is not None:
            self.session_manager.atualizar_frame(solicitacao.session_id, frame_atual)
        if imagem_atual is not None:
            self.session_manager.atualizar_imagem(solicitacao.session_id, imagem_atual)

        return ProcessingResult(
            session_id=solicitacao.session_id,
            status="ok",
            deve_falar=decisao.deve_falar,
            mensagem=decisao.mensagem,
            prioridade=decisao.prioridade,
            motivo=decisao.motivo,
        )
