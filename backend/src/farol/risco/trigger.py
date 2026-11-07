from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RiscoAlertado:
    ultima_area: float
    ultimo_ts: float


def registrar_alerta(estado_risco, chave: int | str, area: float, agora: float) -> None:
    estado_risco.alertados[chave] = RiscoAlertado(ultima_area=area, ultimo_ts=agora)


def limpar_antigos(estado_risco, agora: float, max_idade_s: float) -> None:
    for chave in list(estado_risco.alertados.keys()):
        item = estado_risco.alertados[chave]
        if (agora - item.ultimo_ts) > max_idade_s:
            del estado_risco.alertados[chave]


def deve_alertar(chave: int | str, area: float, agora: float, estado_risco, fator_aproximacao: float = 1.3, repetir_apos_s: int = 10) -> bool:
    anterior = estado_risco.alertados.get(chave)
    if anterior is None:
        return True
    if area > anterior.ultima_area * fator_aproximacao:
        return True
    if (agora - anterior.ultimo_ts) > repetir_apos_s:
        return True
    return False
