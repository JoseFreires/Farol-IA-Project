from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from rules.rules import AnalysisData, SessionMemory, VisualEvent

if TYPE_CHECKING:
    from app.processor import ProcessingRequest

from .models import SkillExecutionRequest
from .skill_executor import SkillExecutor


class LocalizarObjetoResultado(BaseModel):
    objeto_encontrado: bool
    objeto: str | None = None
    posicao: str | None = None
    proximidade: str | None = None
    confianca: float | None = None
    confianca_geral: float | None = None
    fonte: str | None = None
    resposta_semantica: str


class ObjetoAlterado(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = None
    posicao_anterior: str | None = None
    posicao_atual: str | None = None
    confianca: float | None = Field(default=None, ge=0.0, le=1.0)


class MudancaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: Literal[
        "OBJETO_NOVO",
        "OBJETO_REMOVIDO",
        "OBJETO_REPOSICIONADO",
        "ESTADO_ALTERADO",
        "POSSIVEL_BLOQUEIO",
        "ALTERACAO_LAYOUT",
    ]
    descricao: str | None = None
    objetos_alterados: list[ObjetoAlterado] = Field(default_factory=list)
    confianca: float | None = Field(default=None, ge=0.0, le=1.0)
    fonte: str | None = None


class MudancaResultado(BaseModel):
    model_config = ConfigDict(extra="forbid")

    houve_mudanca_relevante: bool
    mudancas: list[MudancaItem]
    confianca_geral: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validar_consistencia(self) -> "MudancaResultado":
        if self.houve_mudanca_relevante != bool(self.mudancas):
            raise ValueError(
                "houve_mudanca_relevante deve corresponder à lista mudancas"
            )
        if self.houve_mudanca_relevante and any(
            item.confianca is None
            and all(objeto.confianca is None for objeto in item.objetos_alterados)
            and self.confianca_geral is None
            for item in self.mudancas
        ):
            raise ValueError(
                "Toda mudança deve informar confiança no item, objeto ou resultado"
            )
        return self


class RiscoResultado(BaseModel):
    possui_possivel_risco: bool
    riscos: list[dict[str, Any]] | None = Field(default=None)
    confianca_geral: float | None = None


class AgentRuntime:
    def __init__(self, skill_executor: SkillExecutor):
        self.skill_executor = skill_executor

    async def processar(self, solicitacao: "ProcessingRequest", memoria: SessionMemory):
        skill_name = solicitacao.skill_override or self._selecionar_skill(
            solicitacao.pergunta,
            memoria.descricao_inicial_realizada,
        )
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
            previous_image=(
                solicitacao.imagem_anterior
                if skill_name == "identify-change"
                else None
            ),
        )

        modelos_saida = {
            "describe-environment": LocalizarObjetoResultado,
            "locate-object": LocalizarObjetoResultado,
            "identify-change": MudancaResultado,
            "detect-risk": RiscoResultado,
        }
        execution = await self.skill_executor.execute(
            agent_name="visual-assistant",
            request=request,
            output_model=modelos_saida[skill_name],
        )

        if not execution.success or execution.data is None:
            return AnalysisData(
                session_id=solicitacao.session_id,
                erro=execution.error_detail or "Falha no runtime de análise",
                confianca_geral=0.0,
                eventos=(),
                objetos=(),
            )

        payload = execution.data
        if skill_name in ("describe-environment", "locate-object"):
            if skill_name == "locate-object":
                return AnalysisData(
                    session_id=solicitacao.session_id,
                    resposta_semantica=payload.resposta_semantica,
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

            return AnalysisData(
                session_id=solicitacao.session_id,
                descricao=payload.resposta_semantica,
                confianca_geral=float(payload.confianca_geral or payload.confianca or 0.0),
                eventos=(),
                objetos=(),
            )

        if skill_name == "detect-risk":
            eventos = tuple(
                VisualEvent(
                    tipo="obstaculo" if "OBSTACULO" in str(item.get("tipo", "")).upper() else "risco",
                    objeto=item.get("objeto"),
                    posicao=item.get("posicao"),
                    proximidade=item.get("proximidade"),
                    confianca=float(item.get("confianca") or 0.0),
                    descricao=item.get("descricao"),
                    metadados={"fonte": item.get("fonte")},
                )
                for item in (payload.riscos or [])
            )
            return AnalysisData(
                session_id=solicitacao.session_id,
                descricao="Avaliação de risco visual realizada.",
                confianca_geral=float(payload.confianca_geral or 0.0),
                eventos=eventos,
                objetos=(),
            )

        eventos = tuple(
            self._evento_mudanca(item, payload.confianca_geral)
            for item in payload.mudancas
        )
        return AnalysisData(
            session_id=solicitacao.session_id,
            confianca_geral=float(payload.confianca_geral or 0.0),
            eventos=eventos,
            objetos=(),
        )

    @staticmethod
    def _selecionar_skill(pergunta: str | None, descricao_inicial_realizada: bool) -> str:
        if not pergunta:
            return (
                "identify-change"
                if descricao_inicial_realizada
                else "describe-environment"
            )

        texto = pergunta.casefold()
        termos_risco = ("risco", "perigo", "obstáculo", "obstaculo", "bloqueio", "seguro")
        if any(termo in texto for termo in termos_risco):
            return "detect-risk"

        termos_mudanca = ("mudou", "mudança", "mudanca", "diferente", "alteração", "alteracao")
        if any(termo in texto for termo in termos_mudanca):
            return "identify-change"

        return "locate-object"

    @staticmethod
    def _evento_mudanca(
        item: MudancaItem,
        confianca_geral: float | None,
    ) -> VisualEvent:
        objeto = item.objetos_alterados[0] if item.objetos_alterados else None
        confianca = (
            item.confianca
            if item.confianca is not None
            else objeto.confianca
            if objeto is not None and objeto.confianca is not None
            else confianca_geral or 0.0
        )
        return VisualEvent(
            tipo="risco" if "BLOQUEIO" in item.tipo.upper() else "mudanca",
            objeto=objeto.nome if objeto else None,
            posicao=objeto.posicao_atual if objeto else None,
            confianca=float(confianca),
            descricao=item.descricao,
            metadados={
                "tipo_mudanca": item.tipo,
                "objetos_alterados": [
                    objeto.model_dump(exclude_none=True)
                    for objeto in item.objetos_alterados
                ],
                "fonte": item.fonte,
            },
        )
