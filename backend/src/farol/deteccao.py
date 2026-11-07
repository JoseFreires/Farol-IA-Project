from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

from ultralytics import YOLO

from src.farol.contratos import Deteccao

logger = logging.getLogger(__name__)


def _converter(resultado: Any, frame_id: int, frame: Any, origem: str, com_id: bool) -> list[Deteccao]:
    h, w = frame.shape[:2]
    out: list[Deteccao] = []
    ids = (
        resultado.boxes.id.int().tolist()
        if com_id and resultado.boxes.id is not None
        else [None] * len(resultado.boxes)
    )
    for box, tid in zip(resultado.boxes, ids):
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        class_id = int(box.cls[0])
        classe = (
            resultado.names.get(class_id, str(class_id))
            if isinstance(resultado.names, dict)
            else resultado.names[class_id]
        )
        out.append(
            Deteccao(
                classe_yolo=classe,
                conf=float(box.conf[0]),
                x1=float(x1),
                y1=float(y1),
                x2=float(x2),
                y2=float(y2),
                id_track=tid,
                frame_id=frame_id,
                origem=origem,
                frame_width=w,
                frame_height=h,
            )
        )
    return out


class DetectorCoco:
    def __init__(self, cfg: dict):
        self.modelo = YOLO(cfg.get("modelo", "yolo26n.pt"))
        self.conf = float(cfg.get("conf_deteccao", 0.25))

    def detectar(self, frame_id: int, frame: Any) -> list[Deteccao]:
        resultado = self.modelo.track(
            frame, persist=True, conf=self.conf, verbose=False
        )[0]
        return _converter(resultado, frame_id, frame, "coco", com_id=True)


class DetectorDegraus:
    def __init__(self, cfg: dict):
        modelo_path = cfg.get("modelo")
        if not modelo_path:
            raise ValueError("yolo_degraus.modelo não foi configurado.")
        self.modelo = YOLO(modelo_path)
        self.conf = float(cfg.get("conf_deteccao", 0.35))
        self.imgsz = cfg.get("imgsz")
        self.cada_n = max(1, int(cfg.get("a_cada_n_frames", 1)))
        self.classes = set(cfg.get("classes", ["degrau"]))
        nomes = set(
            self.modelo.names.values()
            if isinstance(self.modelo.names, dict)
            else self.modelo.names
        )
        desconhecidas = self.classes - nomes
        if desconhecidas:
            raise ValueError(
                f"Classes ausentes em {modelo_path}: {sorted(desconhecidas)}; "
                f"o modelo tem {sorted(nomes)}"
            )
        self._contador = 0
        self._ultimo: list[Deteccao] = []

    def detectar(self, frame_id: int, frame: Any) -> list[Deteccao]:
        if self._contador % self.cada_n == 0:
            kwargs: dict[str, Any] = {"conf": self.conf, "verbose": False}
            if self.imgsz:
                kwargs["imgsz"] = self.imgsz
            resultado = self.modelo.predict(frame, **kwargs)[0]
            self._ultimo = [
                det
                for det in _converter(resultado, frame_id, frame, "degraus", com_id=False)
                if det.classe_yolo in self.classes
            ]
        self._contador += 1
        return [replace(det, frame_id=frame_id) for det in self._ultimo]


class Percepcao:
    def __init__(self, coco: DetectorCoco, degraus: DetectorDegraus | None = None):
        self.coco = coco
        self.degraus = degraus

    def detectar(self, frame_id: int, frame: Any) -> list[Deteccao]:
        deteccoes = self.coco.detectar(frame_id, frame)
        if self.degraus is not None:
            deteccoes.extend(self.degraus.detectar(frame_id, frame))
        return deteccoes


class YOLODetector(DetectorCoco):
    """Compatibilidade com os pontos de entrada anteriores do projeto."""

    def __init__(self, modelo: str = "yolo26n.pt", conf: float = 0.25):
        super().__init__({"modelo": modelo, "conf_deteccao": conf})
