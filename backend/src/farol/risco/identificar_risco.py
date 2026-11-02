from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from src.farol.contratos import Deteccao
from src.farol.filtro import CLASSES_PT, distancia, horizontal


@dataclass(frozen=True)
class RiscoDetectado:
    chave: int | str
    classe_yolo: str
    classe_pt: str
    nivel: str
    area_rel: float
    horizontal: str
    distancia: str
    mensagem: str


def identificar_risco(bruto: Sequence[Deteccao], cfg_risco: dict) -> list[RiscoDetectado]:
    classes = set(cfg_risco.get("classes", []))
    conf_min = float(cfg_risco.get("conf_min", 0.30))
    area_min_alerta = float(cfg_risco.get("area_min_alerta", 0.0))
    classes_criticas = set(cfg_risco.get("classes_criticas", []))
    area_aviso = float(cfg_risco.get("area_aviso", 0.10))
    area_atencao = float(cfg_risco.get("area_atencao", 0.25))
    nomes_pt = cfg_risco.get("nomes_pt", {})

    itens: list[RiscoDetectado] = []
    for det in bruto:
        critica = det.classe_yolo in classes_criticas
        if not critica and (det.origem != "coco" or det.classe_yolo not in classes):
            continue
        if det.conf < conf_min:
            continue

        area_rel = det.area_rel
        if area_rel < area_min_alerta:
            continue
        cx = (det.x1 + det.x2) / 2.0
        largura = float(det.frame_width or max(det.x2, 1.0))
        h = horizontal(cx, largura)

        classe_pt = nomes_pt.get(
            det.classe_yolo, CLASSES_PT.get(det.classe_yolo, det.classe_yolo)
        )

        dist = distancia(area_rel)
        nivel = "ATENCAO" if dist in ("muito perto", "perto") else "AVISO"

        if critica:
            if area_rel > area_atencao:
                nivel = "ATENCAO"
            elif area_rel > area_aviso:
                nivel = "AVISO"
            else:
                continue

        chave = (
            f"{det.classe_yolo}:{h}"
            if critica or det.id_track is None
            else det.id_track
        )
        if nivel == "ATENCAO":
            mensagem = f"Atenção! {classe_pt} {h}, {dist}."
        else:
            mensagem = f"Aviso: {classe_pt} {h}, {dist}."

        itens.append(
            RiscoDetectado(
                chave=chave,
                classe_yolo=det.classe_yolo,
                classe_pt=classe_pt,
                nivel=nivel,
                area_rel=area_rel,
                horizontal=h,
                distancia=dist,
                mensagem=mensagem,
            )
        )

    itens.sort(key=lambda x: (0 if x.nivel == "ATENCAO" else 1, -x.area_rel))
    return itens
