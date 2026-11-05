import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Sequence


class Prioridade(int, Enum):
    CRITICA = 1
    RESPOSTA = 2
    INFORMATIVA = 3


class Motivo(str, Enum):
    RISCO = "RISCO"
    MUDANCA = "MUDANCA"
    MUDANCA_CENA = "MUDANCA_CENA"
    PERGUNTA = "PERGUNTA"
    AMBIENTE = "AMBIENTE"
    ERRO = "ERRO"
    SILENCIO = "SILENCIO"
    RESPOSTA_PERGUNTA = "RESPOSTA_PERGUNTA"
    DESCRICAO_AMBIENTE = "DESCRICAO_AMBIENTE"
    OBJETO_SAIU = "OBJETO_SAIU"


class Origem(str, Enum):
    VLM = "VLM"
    SOMENTE_YOLO = "SOMENTE_YOLO"
    ERRO = "ERRO"
    USUARIO = "USUARIO"


@dataclass(frozen=True)
class Deteccao:
    classe_yolo: str
    conf: float
    x1: float
    y1: float
    x2: float
    y2: float
    id_track: int | str | None = None
    frame_id: int | None = None
    origem: str = "coco"
    frame_width: int | None = None
    frame_height: int | None = None

    @property
    def area(self) -> float:
        return max(0.0, (self.x2 - self.x1) * (self.y2 - self.y1))

    @property
    def area_rel(self) -> float:
        if not self.frame_width or not self.frame_height:
            return 0.0
        return self.area / (self.frame_width * self.frame_height)


@dataclass(frozen=True)
class ObjetoTratado:
    classe_yolo: str
    classe_pt: str
    horizontal: str
    distancia: str
    area_rel: float
    bbox: tuple[float, float, float, float] | None = None
    frame_id: int | None = None
    id_track: int | str | None = None
    origem: str = "coco"
    risco: bool = False


@dataclass(frozen=True)
class MensagemSaida:
    sessionId: str
    frameId: int | None
    timestamp: float
    expiraEmMs: int
    prioridade: Prioridade
    motivo: str | Motivo | None
    origem: Origem | str
    mensagem: str
    deveFalar: bool = True
    interrompe: bool = False
    eventos: list[dict[str, Any]] | None = None
    capturadoEm: float | None = None

    def expirada(self, agora: float | None = None) -> bool:
        agora = time.time() if agora is None else agora
        origem_ttl = self.capturadoEm if self.capturadoEm is not None else self.timestamp
        return origem_ttl + (self.expiraEmMs / 1000.0) < agora

    @property
    def expira_em(self) -> float:
        origem_ttl = self.capturadoEm if self.capturadoEm is not None else self.timestamp
        return origem_ttl + (self.expiraEmMs / 1000.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sessionId": self.sessionId,
            "frameId": self.frameId,
            "timestamp": self.timestamp,
            "expiraEmMs": self.expiraEmMs,
            "capturadoEm": self.capturadoEm,
            "prioridade": int(self.prioridade),
            "motivo": self.motivo.value if isinstance(self.motivo, Enum) else self.motivo,
            "origem": self.origem.value if isinstance(self.origem, Enum) else self.origem,
            "mensagem": self.mensagem,
            "deveFalar": self.deveFalar,
            "interrompe": self.interrompe,
            "eventos": self.eventos or [],
        }
