from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Callable

import cv2
import numpy as np


class SlotFrame:
    def __init__(self):
        self._lock = threading.Lock()
        self._dado: tuple[int, Any] | None = None
        self._contador = 0
        self._requisicoes: deque[tuple[int, Any]] = deque()
        self._timestamps: dict[int, float] = {}

    def publicar(
        self,
        frame: Any,
        *,
        requisicao: bool = False,
        ao_registrar: Callable[[int], None] | None = None,
    ) -> int:
        with self._lock:
            self._contador += 1
            frame_id = self._contador
            self._timestamps[frame_id] = time.time()
            if len(self._timestamps) > 128:
                self._timestamps.pop(next(iter(self._timestamps)))
            if ao_registrar is not None:
                ao_registrar(frame_id)
            self._dado = (frame_id, frame)
            if requisicao:
                self._requisicoes.append((frame_id, frame))
            return frame_id

    def ultimo(self) -> tuple[int, Any] | None:
        with self._lock:
            return self._dado

    def proxima_requisicao(self) -> tuple[int, Any] | None:
        with self._lock:
            return self._requisicoes.popleft() if self._requisicoes else None

    def timestamp(self, frame_id: int) -> float | None:
        with self._lock:
            return self._timestamps.get(frame_id)

    def cancelar_requisicao(self, frame_id: int) -> bool:
        with self._lock:
            for requisicao in self._requisicoes:
                if requisicao[0] == frame_id:
                    self._requisicoes.remove(requisicao)
                    return True
            return False


def decodificar_frame(
    dados: bytes, max_bytes: int = 2_000_000
) -> np.ndarray | None:
    if len(dados) == 0 or len(dados) > max_bytes:
        return None
    try:
        arr = np.frombuffer(dados, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            return None
        return frame
    except Exception:
        return None


def ingerir_frame(slot: SlotFrame, dados: bytes, max_bytes: int = 2_000_000) -> bool:
    frame = decodificar_frame(dados, max_bytes)
    if frame is None:
        return False
    slot.publicar(frame)
    return True


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
