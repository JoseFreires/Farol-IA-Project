from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable


@dataclass(frozen=True, slots=True)
class ResidentialRulesConfig:
    confianca_minima_descricao: float = 0.60
    confianca_minima_resposta: float = 0.65
    confianca_minima_evento: float = 0.70
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
class EventoResidencial:
    tipo: str
    objeto: str | None = None
    posicao: str | None = None
    proximidade: str | None = None
    confianca: float = 0.0
    descricao: str | None = None
    metadados: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class DadosAnaliseResidencial:
    session_id: str
    contexto: str
    descricao: str | None = None
    resposta_semantica: str | None = None
    objetos: tuple[dict[str, Any], ...] = ()
    eventos: tuple[EventoResidencial, ...] = ()
    confianca_geral: float | None = None
    metadados: dict[str, Any] | None = None
    erro: str | None = None


@dataclass(frozen=True, slots=True)
class MemoriaResidencial:
    descricao_inicial_realizada: bool = False
    ultima_descricao: str | None = None
    ultima_mensagem: str | None = None
    ultima_fala_em: datetime | None = None
    motivos_recentes: tuple[str, ...] = ()
    eventos_recentes: tuple[EventoResidencial, ...] = ()


@dataclass(frozen=True, slots=True)
class DecisaoContexto:
    deve_falar: bool
    mensagem: str | None
    prioridade: str
    motivo: str
    cooldown_segundos: int | None = None


class AnaliseResidencialError(RuntimeError):
    pass


class ResidentialRules:
    """Aplica regras do contexto residencial sobre um resultado estruturado da análise."""

    def __init__(
        self,
        config: ResidentialRulesConfig,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config
        self._clock = clock or (lambda: datetime.utcnow())

    def avaliar(
        self,
        dados: DadosAnaliseResidencial,
        memoria: MemoriaResidencial,
        pergunta: str | None,
    ) -> DecisaoContexto:
        if dados.erro:
            raise AnaliseResidencialError(dados.erro)

        if pergunta:
            resposta = self._avaliar_pergunta(dados, pergunta)
            if resposta is not None:
                return resposta

            return DecisaoContexto(
                deve_falar=True,
                mensagem="Não foi possível confirmar essa informação nesta imagem.",
                prioridade="INFORMATIVA",
                motivo="CONFIANCA_INSUFICIENTE",
                cooldown_segundos=None,
            )

        if self._deve_descrever_inicial(memoria, dados):
            return DecisaoContexto(
                deve_falar=True,
                mensagem=dados.descricao,
                prioridade="INFORMATIVA",
                motivo="DESCRICAO_INICIAL",
                cooldown_segundos=self.config.cooldown_descricao_segundos,
            )

        return DecisaoContexto(
            deve_falar=False,
            mensagem=None,
            prioridade="NENHUMA",
            motivo="SEM_EVENTO_RELEVANTE",
            cooldown_segundos=None,
        )

    def _avaliar_pergunta(
        self,
        dados: DadosAnaliseResidencial,
        pergunta: str | None,
    ) -> DecisaoContexto | None:
        if not pergunta:
            return None

        if dados.resposta_semantica and self._conf_suficiente(
            dados.confianca_geral,
            self.config.confianca_minima_resposta,
        ):
            return DecisaoContexto(
                deve_falar=True,
                mensagem=dados.resposta_semantica,
                prioridade="INFORMATIVA",
                motivo="RESPOSTA_A_PERGUNTA",
                cooldown_segundos=None,
            )

        if self._tem_evento_relevante(dados):
            evento = self._maior_evento(dados.eventos)
            if evento is not None and evento.confianca >= self.config.confianca_minima_evento:
                return DecisaoContexto(
                    deve_falar=True,
                    mensagem=self._montar_mensagem_evento(evento),
                    prioridade="ALTA",
                    motivo="POSSIVEL_RISCO_RESIDENCIAL",
                    cooldown_segundos=self.config.cooldown_risco_segundos,
                )

        return None

    def _deve_descrever_inicial(
        self,
        memoria: MemoriaResidencial,
        dados: DadosAnaliseResidencial,
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

    def _tem_evento_relevante(self, dados: DadosAnaliseResidencial) -> bool:
        return any(
            evento.confianca >= self.config.confianca_minima_evento for evento in dados.eventos
        )

    def _maior_evento(
        self,
        eventos: tuple[EventoResidencial, ...],
    ) -> EventoResidencial | None:
        if not eventos:
            return None
        return max(eventos, key=lambda e: e.confianca)

    def _montar_mensagem_evento(self, evento: EventoResidencial) -> str:
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
