from __future__ import annotations

import math
from typing import Sequence

import cv2
import numpy as np

from src.farol.contratos import Deteccao, ObjetoTratado


CLASSES_PT = {
    "person": "pessoa",
    "bicycle": "bicicleta",
    "car": "carro",
    "motorcycle": "motocicleta",
    "airplane": "avião",
    "bus": "ônibus",
    "train": "trem",
    "truck": "caminhão",
    "boat": "barco",
    "traffic light": "semáforo",
    "fire hydrant": "hidrante",
    "stop sign": "placa de pare",
    "parking meter": "parquímetro",
    "bench": "banco",
    "bird": "pássaro",
    "cat": "gato",
    "dog": "cachorro",
    "couch": "sofá",
    "horse": "cavalo",
    "sheep": "ovelha",
    "cow": "vaca",
    "elephant": "elefante",
    "bear": "urso",
    "zebra": "zebra",
    "giraffe": "girafa",
    "backpack": "mochila",
    "umbrella": "guarda-chuva",
    "handbag": "bolsa",
    "tie": "gravata",
    "suitcase": "maleta",
    "frisbee": "frisbee",
    "skis": "esquis",
    "snowboard": "prancha de neve",
    "sports ball": "bola esportiva",
    "kite": "pipa",
    "baseball bat": "bastão de beisebol",
    "baseball glove": "luva de beisebol",
    "skateboard": "skate",
    "surfboard": "prancha de surfe",
    "tennis racket": "raquete de tênis",
    "bottle": "garrafa",
    "plate": "prato",
    "wine glass": "copo",
    "cup": "xícara",
    "fork": "garfo",
    "knife": "faca",
    "spoon": "colher",
    "bowl": "tigela",
    "banana": "banana",
    "apple": "maçã",
    "sandwich": "sanduíche",
    "orange": "laranja",
    "broccoli": "brócolis",
    "carrot": "cenoura",
    "hot dog": "cachorro-quente",
    "pizza": "pizza",
    "donut": "rosquinha",
    "cake": "bolo",
    "chair": "cadeira",
    "sofa": "sofá",
    "bed": "cama",
    "diningtable": "mesa",
    "toilet": "banheiro",
    "tv": "televisão",
    "laptop": "notebook",
    "mouse": "mouse",
    "remote": "controle remoto",
    "keyboard": "teclado",
    "cell phone": "celular",
    "microwave": "micro-ondas",
    "oven": "forno",
    "toaster": "torradeira",
    "sink": "pia",
    "refrigerator": "geladeira",
    "book": "livro",
    "clock": "relógio",
    "vase": "vaso",
    "scissors": "tesoura",
    "teddy bear": "urso de pelúcia",
    "hair drier": "secador de cabelo",
    "toothbrush": "escova de dentes",
    "potted plant": "vaso com planta",
    "tvmonitor": "monitor",
    "door": "porta",
    "window": "janela",
    "stair": "escada",
    "step": "degrau",
    "puddle": "poça",
    "hole": "buraco",
}  # noqa: E501


def horizontal(cx: float, w: float = 1.0) -> str:
    if cx < w * 0.34:
        return "à esquerda"
    if cx < w * 0.67:
        return "à frente"
    return "à direita"


def vertical(cy: float, h: float = 1.0) -> str:
    if cy < h * 0.34:
        return "acima"
    if cy < h * 0.67:
        return "no meio"
    return "embaixo"


def distancia(area_rel: float) -> str:
    if area_rel >= 0.02:
        return "perto"
    if area_rel >= 0.01:
        return "a média distância"
    return "longe"


def _area_rel(det: Deteccao, largura: int, altura: int) -> float:
    if largura <= 0 or altura <= 0:
        return 0.0
    box_w = max(0.0, det.x2 - det.x1)
    box_h = max(0.0, det.y2 - det.y1)
    return (box_w * box_h) / (largura * altura)


def filtro_normal(bruto: Sequence[Deteccao], cfg_filtro: dict) -> tuple[ObjetoTratado, ...]:
    largura = cfg_filtro.get("largura", 1280)
    altura = cfg_filtro.get("altura", 720)
    min_conf = float(cfg_filtro.get("conf_min", 0.50))
    min_area = float(cfg_filtro.get("area_min", 0.01))
    max_objetos = int(cfg_filtro.get("max_objetos", 8))

    tratados: list[ObjetoTratado] = []
    for det in bruto:
        if det.origem != "coco":
            continue
        if det.conf < min_conf:
            continue
        area_rel = _area_rel(det, largura, altura)
        if area_rel < min_area:
            continue
        cx = (det.x1 + det.x2) / 2.0
        cy = (det.y1 + det.y2) / 2.0
        bbox = (float(det.x1), float(det.y1), float(det.x2), float(det.y2))
        classe_pt = CLASSES_PT.get(det.classe_yolo.lower(), det.classe_yolo)
        tratados.append(
            ObjetoTratado(
                classe_yolo=det.classe_yolo,
                classe_pt=classe_pt,
                horizontal=horizontal(cx, largura),
                distancia=distancia(area_rel),
                area_rel=area_rel,
                bbox=bbox,
                frame_id=det.frame_id,
                id_track=det.id_track,
            )
        )

    tratados.sort(key=lambda obj: (-obj.area_rel, obj.classe_pt.lower()))
    return tuple(tratados[:max_objetos])


def filtro_degraus(
    bruto_degraus: Sequence[Deteccao], cfg_filtro: dict, cfg_degraus: dict
) -> tuple[ObjetoTratado, ...]:
    largura = int(cfg_filtro.get("largura", 1280))
    altura = int(cfg_filtro.get("altura", 720))
    min_area = float(cfg_filtro.get("area_min", 0.01))
    classes = set(cfg_degraus.get("classes", ["degrau"]))
    nomes_pt = cfg_degraus.get("nomes_pt", {})

    tratados: list[ObjetoTratado] = []
    for det in bruto_degraus:
        if det.origem != "degraus" or det.classe_yolo not in classes:
            continue
        area_rel = _area_rel(det, largura, altura)
        if area_rel < min_area:
            continue
        cx = (det.x1 + det.x2) / 2.0
        cy = (det.y1 + det.y2) / 2.0
        tratados.append(
            ObjetoTratado(
                classe_yolo=det.classe_yolo,
                classe_pt=nomes_pt.get(det.classe_yolo, CLASSES_PT.get(det.classe_yolo, det.classe_yolo)),
                horizontal=horizontal(cx, largura),
                distancia=distancia(area_rel),
                area_rel=area_rel,
                bbox=(float(det.x1), float(det.y1), float(det.x2), float(det.y2)),
                frame_id=det.frame_id,
                id_track=None,
                origem="degraus",
                risco=True,
            )
        )
    return tuple(tratados)


def montar_base(
    bruto: Sequence[Deteccao], cfg_filtro: dict, cfg_degraus: dict
) -> tuple[ObjetoTratado, ...]:
    coco = filtro_normal(
        [det for det in bruto if det.origem == "coco"], cfg_filtro
    )
    degraus = filtro_degraus(
        [det for det in bruto if det.origem == "degraus"], cfg_filtro, cfg_degraus
    )
    return degraus + coco


def recortar(frame: np.ndarray, bbox: tuple[float, float, float, float], margem: float = 0.15) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    pad_x = max(1, int((x2 - x1) * margem))
    pad_y = max(1, int((y2 - y1) * margem))
    x1_i = max(0, int(x1) - pad_x)
    y1_i = max(0, int(y1) - pad_y)
    x2_i = min(w, int(x2) + pad_x)
    y2_i = min(h, int(y2) + pad_y)
    return frame[y1_i:y2_i, x1_i:x2_i]


def jpeg(frame: np.ndarray, qualidade: int = 80, max_lado: int = 640) -> bytes:
    if frame is None or frame.size == 0:
        raise ValueError("frame inválido")
    h, w = frame.shape[:2]
    if max(h, w) > max_lado:
        escala = max_lado / float(max(h, w))
        novo_h = max(1, int(round(h * escala)))
        novo_w = max(1, int(round(w * escala)))
        frame = cv2.resize(frame, (novo_w, novo_h), interpolation=cv2.INTER_AREA)
    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), qualidade])
    return buf.tobytes()
