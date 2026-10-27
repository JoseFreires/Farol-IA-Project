from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable


@dataclass(frozen=True, slots=True)
class RulesConfig:
    confianca_minima_descricao: float = 0.60
    confianca_minima_resposta: float = 0.65
    confianca_minima_evento: float = 0.55
    cooldown_descricao_segundos: int = 15
    cooldown_mudanca_segundos: int = 10
    cooldown_risco_segundos: int = 5

    def __post_init__(self) -> None:
        if not 0.0 <= self.confianca_minima_descricao <= 1.0:
            raise ValueError("confianca_minima_descricao fora do intervalo [0, 1]")
        if not 0.0 <= self.confianca_minima_resposta <= 1.0:
            raise ValueError("confianca_minima_resposta fora do intervalo [0, 1]")
        if not 0.0 <= self.confianca_minima_evento <= 1.0:
            raise ValueError("confianca_minima_evento fora do intervalo [0, 1]")
        if self.cooldown_descricao_segundos < 0:
            raise ValueError("cooldown_descricao_segundos não pode ser negativo")
        if self.cooldown_mudanca_segundos < 0:
            raise ValueError("cooldown_mudanca_segundos não pode ser negativo")
        if self.cooldown_risco_segundos < 0:
            raise ValueError("cooldown_risco_segundos não pode ser negativo")


@dataclass(frozen=True, slots=True)
class VisualEvent:
    tipo: str
    objeto: str | None = None
    posicao: str | None = None
    proximidade: str | None = None
    confianca: float = 0.0
    descricao: str | None = None
    metadados: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class AnalysisData:
    session_id: str
    descricao: str | None = None
    resposta_semantica: str | None = None
    objetos: tuple[dict[str, Any], ...] = ()
    eventos: tuple[VisualEvent, ...] = ()
    confianca_geral: float | None = None
    metadados: dict[str, Any] | None = None
    erro: str | None = None


@dataclass(frozen=True, slots=True)
class SessionMemory:
    descricao_inicial_realizada: bool = False
    ultima_descricao: str | None = None
    ultima_mensagem: str | None = None
    ultima_fala_em: datetime | None = None
    motivos_recentes: tuple[str, ...] = ()
    eventos_recentes: tuple[VisualEvent, ...] = ()
    objetos_recentes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ProcessingDecision:
    deve_falar: bool
    mensagem: str | None
    prioridade: str
    motivo: str
    cooldown_segundos: int | None = None
    eventos_anunciados: tuple[VisualEvent, ...] = ()


class AnalysisError(RuntimeError):
    pass


class Rules:
    """Applies deterministic communication rules to structured visual analysis."""

    def __init__(
        self,
        config: RulesConfig,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config
        self._clock = clock or (lambda: datetime.utcnow())

    def avaliar(
        self,
        dados: AnalysisData,
        memoria: SessionMemory,
        pergunta: str | None,
    ) -> ProcessingDecision:
        if dados.erro:
            raise AnalysisError(dados.erro)

        if pergunta:
            resposta = self._avaliar_pergunta(dados, pergunta)
            if resposta is not None:
                return resposta

            return ProcessingDecision(
                deve_falar=True,
                mensagem="Não foi possível confirmar essa informação nesta imagem.",
                prioridade="INFORMATIVA",
                motivo="CONFIANCA_INSUFICIENTE",
                cooldown_segundos=None,
            )

        # Structured events take precedence over a global description.
        evento = self._avaliar_novo_evento(dados, memoria)
        if evento is not None:
            return evento

        if self._deve_descrever_inicial(memoria, dados):
            return ProcessingDecision(
                deve_falar=True,
                mensagem=dados.descricao,
                prioridade="INFORMATIVA",
                motivo="DESCRICAO_INICIAL",
                cooldown_segundos=self.config.cooldown_descricao_segundos,
            )

        mudanca_textual = self._avaliar_mudanca_textual(dados, memoria)
        if mudanca_textual is not None:
            return mudanca_textual

        return ProcessingDecision(
            deve_falar=False,
            mensagem=None,
            prioridade="NENHUMA",
            motivo="SEM_EVENTO_RELEVANTE",
            cooldown_segundos=None,
        )

    def _avaliar_novo_evento(
        self,
        dados: AnalysisData,
        memoria: SessionMemory,
    ) -> ProcessingDecision | None:
        eventos_novos = [
            evento
            for evento in dados.eventos
            if evento not in memoria.eventos_recentes
            and evento.confianca >= self.config.confianca_minima_evento
        ]
        evento = self._maior_evento(tuple(eventos_novos))
        if evento is None:
            return None

        risco = evento.tipo in ("risco", "obstaculo")
        cooldown = (
            self.config.cooldown_risco_segundos
            if risco
            else self.config.cooldown_mudanca_segundos
        )

        return ProcessingDecision(
            deve_falar=True,
            mensagem=self._montar_mensagem_evento(evento),
            prioridade="ALTA" if risco else "INFORMATIVA",
            motivo="POSSIVEL_RISCO" if risco else "MUDANCA_DETECTADA",
            cooldown_segundos=cooldown,
            eventos_anunciados=(evento,),
        )

    def _avaliar_mudanca_textual(
        self,
        dados: AnalysisData,
        memoria: SessionMemory,
    ) -> ProcessingDecision | None:
        texto_mudanca = dados.descricao or dados.resposta_semantica
        if not texto_mudanca:
            return None

        confianca = dados.confianca_geral if dados.confianca_geral is not None else 1.0
        if not self._conf_suficiente(confianca, self.config.confianca_minima_evento):
            return None

        # Evita repetir exatamente a mesma descrição caso não tenha mudado
        if memoria.ultima_descricao and memoria.ultima_descricao.strip().lower() == texto_mudanca.strip().lower():
            return None

        cooldown = self.config.cooldown_mudanca_segundos
        if memoria.ultima_fala_em is not None:
            delta = (self._clock() - memoria.ultima_fala_em).total_seconds()
            if delta < cooldown:
                return None

        return ProcessingDecision(
            deve_falar=True,
            mensagem=texto_mudanca,
            prioridade="INFORMATIVA",
            motivo="MUDANCA_DETECTADA",
            cooldown_segundos=cooldown,
        )

    def _avaliar_pergunta(
        self,
        dados: AnalysisData,
        pergunta: str | None,
    ) -> ProcessingDecision | None:
        if not pergunta:
            return None

        if dados.resposta_semantica and self._conf_suficiente(
            dados.confianca_geral,
            self.config.confianca_minima_resposta,
        ):
            return ProcessingDecision(
                deve_falar=True,
                mensagem=dados.resposta_semantica,
                prioridade="INFORMATIVA",
                motivo="RESPOSTA_A_PERGUNTA",
                cooldown_segundos=None,
            )

        if self._tem_evento_relevante(dados):
            evento = self._maior_evento(dados.eventos)
            if evento is not None and evento.confianca >= self.config.confianca_minima_evento:
                risco = evento.tipo in ("risco", "obstaculo")
                return ProcessingDecision(
                    deve_falar=True,
                    mensagem=self._montar_mensagem_evento(evento),
                    prioridade="ALTA" if risco else "INFORMATIVA",
                    motivo="POSSIVEL_RISCO" if risco else "MUDANCA_DETECTADA",
                    cooldown_segundos=(
                        self.config.cooldown_risco_segundos
                        if risco
                        else self.config.cooldown_mudanca_segundos
                    ),
                    eventos_anunciados=(evento,),
                )

        return None

    def _deve_descrever_inicial(
        self,
        memoria: SessionMemory,
        dados: AnalysisData,
    ) -> bool:
        if memoria.descricao_inicial_realizada:
            return False

        if not dados.descricao:
            return False

        if not self._conf_suficiente(
            dados.confianca_geral,
            self.config.confianca_minima_descricao,
        ):
            return False

        if memoria.ultima_fala_em is not None:
            agora = self._clock()
            delta = (agora - memoria.ultima_fala_em).total_seconds()
            if delta < self.config.cooldown_descricao_segundos:
                return False

        return True

    def _tem_evento_relevante(self, dados: AnalysisData) -> bool:
        return any(
            evento.confianca >= self.config.confianca_minima_evento for evento in dados.eventos
        )

    def _maior_evento(
        self,
        tuples: tuple[VisualEvent, ...],
    ) -> VisualEvent | None:
        if not tuples:
            return None
        return max(tuples, key=lambda e: e.confianca)

    def _montar_mensagem_evento(self, evento: VisualEvent) -> str:
        if (
            evento.metadados
            and evento.metadados.get("tipo_mudanca") == "OBJETO_REMOVIDO"
            and evento.objeto
        ):
            if evento.descricao:
                return evento.descricao
            return f"O objeto {evento.objeto} não aparece mais na imagem atual."
        if evento.tipo == "obstaculo" and evento.objeto and evento.posicao:
            return f"Atenção, {evento.objeto} à {self._posicao_para_texto(evento.posicao)}."
        if evento.tipo == "risco" and evento.objeto:
            return f"Possível risco em {evento.objeto}."
        if evento.descricao:
            return evento.descricao
        return "Há uma mudança relevante no ambiente."

    @staticmethod
    def _posicao_para_texto(posicao: str) -> str:
        mapa = {
            "frente": "frente",
            "direita": "direita",
            "esquerda": "esquerda",
            "centro": "centro",
        }
        return mapa.get(posicao.lower(), "próximo")

    @staticmethod
    def _conf_suficiente(valor: float | None, limite: float) -> bool:
        return valor is not None and valor >= limite