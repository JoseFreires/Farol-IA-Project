from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from rules.residential_rules import DadosAnaliseResidencial, EventoResidencial

if TYPE_CHECKING:
    from app.orquestrador import SolicitacaoProcessamento

from .agent_planner import AgentPlanner
from .agent_registry import AgentRegistry
from .exceptions import SkillNotFoundError
from .models import AgentRegistration, AgentPlan, SkillExecutionRequest
from .skill_executor import SkillExecutor


class LocalizarObjetoResultado(BaseModel):
    objeto_encontrado: bool
    objeto: str | None = None
    posicao: str | None = None
    proximidade: str | None = None
    confianca: float | None = None
    confianca_geral: float | None = None
    fonte: str | None = None
    resposta_semantica: str | None = None


class MudancaResultado(BaseModel):
    houve_mudanca_relevante: bool
    mudancas: list[dict[str, Any]] | None = Field(default=None)
    confianca_geral: float | None = None


class RiscoResultado(BaseModel):
    possui_possivel_risco: bool
    riscos: list[dict[str, Any]] | None = Field(default=None)
    confianca_geral: float | None = None


class ResidentialAgentRuntime:
    def __init__(self, agent_registry: AgentRegistry, skill_executor: SkillExecutor, agent_planner: AgentPlanner):
        self.agent_registry = agent_registry
        self.skill_executor = skill_executor
        self.agent_planner = agent_planner

    async def processar(self, solicitacao: "SolicitacaoProcessamento", memoria):
        registration = self.agent_registry.get("agente-residencial")
        agent_definition = self.agent_registry.load_definition("agente-residencial")

        allowed_skills = sorted(registration.allowed_skills)
        plan = await self.agent_planner.plan(
            system_instructions=agent_definition.instructions,
            input_data={
                "pergunta": solicitacao.pergunta,
                "historico": [],
                "memoria": {
                    "ultima_descricao": memoria.ultima_descricao,
                    "descricao_inicial_realizada": memoria.descricao_inicial_realizada,
                },
            },
            allowed_skills=allowed_skills,
            correlation_id=solicitacao.session_id,
        )

        if not solicitacao.pergunta and not memoria.descricao_inicial_realizada:
            skill_name = "descrever-ambiente-residencial"
        else:
            skill_name = plan.skills[0].name if plan.skills else allowed_skills[0]

        if skill_name not in registration.allowed_skills:
            raise SkillNotFoundError(f"Skill não autorizada: {skill_name}")

        request = SkillExecutionRequest(
            skill_name=skill_name,
            image=solicitacao.imagem,
            input_data={
                "objeto_alvo": solicitacao.pergunta.lower() if solicitacao.pergunta else None,
                "ultima_descricao": memoria.ultima_descricao,
                "objetos_recentes": [],
                "pergunta": solicitacao.pergunta,
            },
            session_id=solicitacao.session_id,
            correlation_id=solicitacao.session_id,
        )

        if skill_name == "descrever-ambiente-residencial":
            output_model = LocalizarObjetoResultado
        elif skill_name == "localizar-objeto-residencial":
            output_model = LocalizarObjetoResultado
        elif skill_name == "identificar-mudanca-residencial":
            output_model = MudancaResultado
        elif skill_name == "detectar-risco-domiciliar":
            output_model = RiscoResultado
        else:
            output_model = LocalizarObjetoResultado

        execution = await self.skill_executor.execute(
            agent_name="agente-residencial",
            request=request,
            output_model=output_model,
        )

        if not execution.success or execution.data is None:
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                erro=execution.error_detail or "Falha no agente residencial",
                confianca_geral=0.0,
                eventos=(),
                objetos=(),
            )

        payload = execution.data
        if skill_name == "localizar-objeto-residencial":
            resposta = payload.resposta_semantica or "Não foi possível localizar o objeto solicitado."
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                resposta_semantica=resposta,
                confianca_geral=float(payload.confianca or 0.0),
                objetos=(
                    {
                        "nome": payload.objeto,
                        "posicao": payload.posicao,
                        "proximidade": payload.proximidade,
                        "confianca": payload.confianca,
                    },
                ) if payload.objeto_encontrado and payload.objeto else (),
                eventos=(),
            )

        if skill_name == "detectar-risco-domiciliar":
            eventos = tuple(
                EventoResidencial(
                    tipo="risco",
                    objeto=item.get("objeto"),
                    posicao=item.get("posicao"),
                    proximidade=item.get("proximidade"),
                    confianca=float(item.get("confianca") or 0.0),
                    descricao=item.get("descricao"),
                    metadados={"fonte": item.get("fonte")},
                )
                for item in (payload.riscos or [])
            )
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                descricao="Avaliação de risco domiciliar realizada.",
                confianca_geral=float(payload.confianca_geral or 0.0),
                eventos=eventos,
                objetos=(),
            )

        if skill_name == "descrever-ambiente-residencial":
            descricao = payload.resposta_semantica or "Ambiente residencial descrito."
            return DadosAnaliseResidencial(
                session_id=solicitacao.session_id,
                contexto=solicitacao.contexto,
                descricao=descricao,
                confianca_geral=float(getattr(payload, "confianca_geral", None) or getattr(payload, "confianca", None) or 0.0),
                eventos=(),
                objetos=(),
            )

        return DadosAnaliseResidencial(
            session_id=solicitacao.session_id,
            contexto=solicitacao.contexto,
            descricao=getattr(payload, "resposta_semantica", None) or "Mudança residencial avaliada.",
            confianca_geral=float(getattr(payload, "confianca_geral", None) or getattr(payload, "confianca", None) or 0.0),
            eventos=(),
            objetos=(),
        )
