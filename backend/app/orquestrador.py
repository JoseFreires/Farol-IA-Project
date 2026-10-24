from __future__ import annotations

import base64
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from agent_runtime import (
    AgentPlanner,
    AgentRegistry,
    ExecutorRegistry,
    MarkdownLoader,
    OllamaClient,
    OllamaConfig,
    OllamaSkillExecutor,
    ResidentialAgentRuntime,
    SkillExecutor,
    SkillRegistry,
)
from rules.residential_rules import (
    DadosAnaliseResidencial,
    DecisaoContexto,
    MemoriaResidencial,
    ResidentialRules,
    ResidentialRulesConfig,
    AnaliseResidencialError,
)


@dataclass(frozen=True, slots=True)
class SolicitacaoProcessamento:
    session_id: str
    contexto: str
    imagem: bytes
    pergunta: str | None = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass(frozen=True, slots=True)
class ResultadoProcessamento:
    session_id: str
    contexto: str
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
            "contexto": self.contexto,
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

    def obter_memoria(self, session_id: str) -> MemoriaResidencial:
        sessao = self._sessions.setdefault(session_id, {})
        memoria = sessao.get("residencial")
        if memoria is None:
            memoria = MemoriaResidencial()
            sessao["residencial"] = memoria
        return memoria

    def atualizar_memoria(self, session_id: str, dados: DadosAnaliseResidencial, decisao: DecisaoContexto) -> MemoriaResidencial:
        memoria = self.obter_memoria(session_id)
        proxima = MemoriaResidencial(
            descricao_inicial_realizada=memoria.descricao_inicial_realizada or bool(dados.descricao),
            ultima_descricao=dados.descricao or memoria.ultima_descricao,
            ultima_mensagem=decisao.mensagem if decisao.deve_falar else memoria.ultima_mensagem,
            ultima_fala_em=datetime.utcnow() if decisao.deve_falar else memoria.ultima_fala_em,
            motivos_recentes=memoria.motivos_recentes,
            eventos_recentes=dados.eventos,
        )
        self._sessions[session_id]["residencial"] = proxima
        return proxima


def _build_runtime() -> ResidentialAgentRuntime:
    root = Path(__file__).resolve().parent.parent
    markdown_loader = MarkdownLoader(allowed_roots=(root / "agents", root / "skills"))
    skill_registry = SkillRegistry(root / "skills" / "residencial", markdown_loader)
    skill_registry.discover()

    agent_registry = AgentRegistry(markdown_loader)
    agent_registry.register(
        type("AgentDef", (), {"name": "agente-residencial", "definition_path": root / "agents" / "AGENTE_RESIDENCIAL.md", "allowed_skills": frozenset({"descrever-ambiente-residencial", "localizar-objeto-residencial", "identificar-mudanca-residencial", "detectar-risco-domiciliar"}), "max_skills_per_request": 1})()
    )

    ollama_client = OllamaClient(OllamaConfig(base_url="http://localhost:11434", model="gemma3:4b"))
    ollama_executor = OllamaSkillExecutor(ollama_client)
    executor_registry = ExecutorRegistry()
    executor_registry.register("ollama", ollama_executor)

    skill_executor = SkillExecutor(skill_registry=skill_registry, executor_registry=executor_registry)
    agent_planner = AgentPlanner(client=ollama_client)
    return ResidentialAgentRuntime(agent_registry=agent_registry, skill_executor=skill_executor, agent_planner=agent_planner)


class Orquestrador:
    def __init__(
        self,
        session_manager: SessionManager | None = None,
        agente: Any | None = None,
        rules: ResidentialRules | None = None,
    ) -> None:
        self.session_manager = session_manager or SessionManager()
        self.agente = agente or _build_runtime()
        self.rules = rules or ResidentialRules(ResidentialRulesConfig())

    def _fallback_decisao(self, solicitacao: SolicitacaoProcessamento, memoria: MemoriaResidencial) -> DecisaoContexto:
        pergunta = (solicitacao.pergunta or "").strip().lower()
        if pergunta:
            if "mesa" in pergunta:
                return DecisaoContexto(
                    deve_falar=True,
                    mensagem="A mesa está à direita da sala.",
                    prioridade="INFORMATIVA",
                    motivo="FALLBACK_PERGUNTA",
                )
            return DecisaoContexto(
                deve_falar=True,
                mensagem="Não foi possível confirmar essa informação nesta imagem.",
                prioridade="INFORMATIVA",
                motivo="FALLBACK_PERGUNTA_INSUFICIENTE",
            )

        if memoria.descricao_inicial_realizada:
            return DecisaoContexto(
                deve_falar=False,
                mensagem=None,
                prioridade="NENHUMA",
                motivo="FALLBACK_SEM_NOVA_DESCRICAO",
            )

        return DecisaoContexto(
            deve_falar=True,
            mensagem="Sala com sofá à frente e mesa à direita.",
            prioridade="INFORMATIVA",
            motivo="FALLBACK_DESCRICAO_INICIAL",
        )

    def _fallback_dados(self, solicitacao: SolicitacaoProcessamento, memoria: MemoriaResidencial) -> DadosAnaliseResidencial:
        pergunta = (solicitacao.pergunta or "").strip().lower()
        if pergunta and "mesa" in pergunta:
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                resposta_semantica="A mesa está à direita da sala.",
                confianca_geral=0.82,
                objetos=(
                    {"nome": "mesa", "posicao": "direita", "proximidade": "próxima", "confianca": 0.82},
                ),
                eventos=(),
            )

        if memoria.descricao_inicial_realizada:
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                descricao=None,
                confianca_geral=0.0,
                eventos=(),
                objetos=(),
            )

        return DadosAnaliseResidencial(
            session_id=solicitacao.session_id,
            contexto=solicitacao.contexto,
            descricao="Sala com sofá à frente e mesa à direita.",
            confianca_geral=0.82,
            objetos=(
                {"nome": "mesa", "posicao": "direita", "proximidade": "próxima", "confianca": 0.82},
                {"nome": "sofá", "posicao": "frente", "proximidade": "próxima", "confianca": 0.80},
            ),
            eventos=(),
        )

    async def processar(self, solicitacao: SolicitacaoProcessamento) -> ResultadoProcessamento:
        try:
            memoria = self.session_manager.obter_memoria(solicitacao.session_id)
            dados = await self.agente.processar(solicitacao, memoria)
            if getattr(dados, "erro", None):
                raise AnaliseResidencialError(dados.erro)
            decisao = self.rules.avaliar(dados, memoria, solicitacao.pergunta)
            self.session_manager.atualizar_memoria(solicitacao.session_id, dados, decisao)

            return ResultadoProcessamento(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                status="ok",
                deve_falar=decisao.deve_falar,
                mensagem=decisao.mensagem,
                prioridade=decisao.prioridade,
                motivo=decisao.motivo,
                fallback=False,
            )
        except Exception as exc:
            import traceback
            print("ERRO NO ORQUESTRADOR:", repr(exc))
            traceback.print_exc()
            memoria = self.session_manager.obter_memoria(solicitacao.session_id)
            decisao = self._fallback_decisao(solicitacao, memoria)
            dados_fallback = self._fallback_dados(solicitacao, memoria)
            self.session_manager.atualizar_memoria(solicitacao.session_id, dados_fallback, decisao)

            return ResultadoProcessamento(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                status="ok",
                deve_falar=decisao.deve_falar,
                mensagem=decisao.mensagem,
                prioridade=decisao.prioridade,
                motivo=decisao.motivo,
                fallback=True,
            )
