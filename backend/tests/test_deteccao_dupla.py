from types import SimpleNamespace

import numpy as np
import pytest

from src.farol.contratos import Deteccao
from src.farol.deteccao import DetectorDegraus, Percepcao


class _Box:
    def __init__(self, classe=0, conf=0.8):
        self.cls = np.array([classe])
        self.conf = np.array([conf])
        self.xyxy = np.array([[10, 20, 90, 80]], dtype=float)


class _Boxes(list):
    id = None


class _ModeloFake:
    names = {0: "degrau"}

    def __init__(self, results):
        self.results = iter(results)
        self.calls = []

    def predict(self, frame, **kwargs):
        self.calls.append(kwargs)
        return [next(self.results)]


def _resultado(*boxes):
    return SimpleNamespace(boxes=_Boxes(boxes), names={0: "degrau"})


def test_detector_degraus_reaproveita_resultado_e_atualiza_frame_id(monkeypatch):
    modelo = _ModeloFake(
        [
            _resultado(_Box()),
            _resultado(),
        ]
    )
    monkeypatch.setattr("src.farol.deteccao.YOLO", lambda _: modelo)
    detector = DetectorDegraus(
        {
            "modelo": "stairs.pt",
            "classes": ["degrau"],
            "a_cada_n_frames": 2,
            "imgsz": 480,
        }
    )
    frame = np.zeros((100, 100, 3), dtype=np.uint8)

    primeiro = detector.detectar(0, frame)
    reaproveitado = detector.detectar(1, frame)
    vazio = detector.detectar(2, frame)

    assert len(modelo.calls) == 2
    assert modelo.calls[0]["imgsz"] == 480
    assert primeiro[0].origem == "degraus"
    assert primeiro[0].id_track is None
    assert reaproveitado[0].frame_id == 1
    assert vazio == []


def test_detector_degraus_rejeita_classe_ausente(monkeypatch):
    modelo = _ModeloFake([])
    modelo.names = {0: "stair"}
    monkeypatch.setattr("src.farol.deteccao.YOLO", lambda _: modelo)

    with pytest.raises(ValueError, match="degrau"):
        DetectorDegraus({"modelo": "stairs.pt", "classes": ["degrau"]})


def test_percepcao_agrega_coco_e_degraus_com_mesmo_frame():
    coco = SimpleNamespace(
        detectar=lambda frame_id, frame: [
            Deteccao("chair", 0.9, 0, 0, 20, 20, frame_id=frame_id)
        ]
    )
    degraus = SimpleNamespace(
        detectar=lambda frame_id, frame: [
            Deteccao(
                "degrau",
                0.8,
                10,
                10,
                80,
                90,
                frame_id=frame_id,
                origem="degraus",
            )
        ]
    )

    deteccoes = Percepcao(coco, degraus).detectar(7, object())

    assert [det.origem for det in deteccoes] == ["coco", "degraus"]
    assert {det.frame_id for det in deteccoes} == {7}
