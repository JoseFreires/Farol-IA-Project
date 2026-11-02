from __future__ import annotations

import threading
import time
from typing import Any

import cv2
import numpy as np


class SlotFrame:
    def __init__(self):
        self._lock = threading.Lock()
        self._dado: tuple[int, Any] | None = None
        self._contador = 0

    def publicar(self, frame: Any) -> int:
        with self._lock:
            self._contador += 1
            self._dado = (self._contador, frame)
            return self._contador

    def ultimo(self) -> tuple[int, Any] | None:
        with self._lock:
            return self._dado


def ingerir_frame(slot: SlotFrame, dados: bytes, max_bytes: int = 2_000_000) -> bool:
    if len(dados) == 0 or len(dados) > max_bytes:
        return False
    try:
        arr = np.frombuffer(dados, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            return False
        slot.publicar(frame)
        return True
    except Exception:
        return False


def capturar(fonte, slot: SlotFrame, parar: threading.Event, loop_video: bool = True) -> None:
    if isinstance(fonte, str) and fonte.lower() in {"api", ""}:
        raise ValueError("fonte inválida para capturar em desenvolvimento")

    cap = cv2.VideoCapture(int(fonte)) if isinstance(fonte, int) else cv2.VideoCapture(str(fonte))
    if not cap.isOpened():
        raise RuntimeError(f"Não foi possível abrir a fonte de vídeo: {fonte}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    intervalo = 1.0 / max(fps, 1.0)
    while not parar.is_set():
        ok, frame = cap.read()
        if not ok:
            if isinstance(fonte, str) and loop_video:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            break
        slot.publicar(frame)
        time.sleep(intervalo)
    cap.release()
