from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

from src.farol.risco.trigger import RiscoAlertado


@dataclass(frozen=True)
class EstadoRisco:
    alertados: dict[int | str, RiscoAlertado] = field(default_factory=dict)


@dataclass(frozen=True)
class EstadoSessao:
    ultimo_ts_fala: float | None = None
    contexto_invalido: bool = False
    ultimo_frame: Any | None = None
    ultimo_json: tuple = ()
    descricao_inicial_feita: bool = False
    descricao_em_andamento: bool = False
    ultima_descricao: str = ""
    ultimo_frame_id: int | None = None
    ultima_pergunta: str = ""
    estado_mudanca: Any | None = None
    riscos_alertados: set[int | str] = field(default_factory=set)
    revisao_contexto: int = 0


class Sessao:
    def __init__(self, estado: EstadoSessao | None = None):
        self.estado = estado or EstadoSessao()

    def atualizar(self, **mudancas) -> EstadoSessao:
        self.estado = replace(self.estado, **mudancas)
        return self.estado

    @property
    def ultimo_json(self):
        return self.estado.ultimo_json

    @property
    def ultimo_frame(self):
        return self.estado.ultimo_frame
