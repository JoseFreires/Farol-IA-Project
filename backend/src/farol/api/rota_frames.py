from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from src.farol import captura


logger = logging.getLogger(__name__)
router = APIRouter()


@dataclass
class Deps:
    slot: captura.SlotFrame
    sessao: object
    fila_llm: object
    fila_saida: object
    skills: dict
    cfg: dict
    parar: object


@router.websocket("/ws/frames")
async def ws_frames(websocket: WebSocket):
    await websocket.accept()
    deps = websocket.app.state.deps
    try:
        while True:
            dados = await websocket.receive_bytes()
            if not deps.slot:
                continue
            captura.ingerir_frame(deps.slot, dados, deps.cfg.get("api", {}).get("frame_max_bytes", 2_000_000))
    except WebSocketDisconnect:
        logger.info("websocket /ws/frames desconectado")
    except Exception as exc:
        logger.exception("erro ao receber frame via websocket: %s", exc)


@router.post("/frame")
async def frame_upload(request: Request):
    payload = await request.body()
    deps = request.app.state.deps
    ok = captura.ingerir_frame(deps.slot, payload, deps.cfg.get("api", {}).get("frame_max_bytes", 2_000_000))
    if not ok:
        raise HTTPException(status_code=400, detail="frame inválido")

    if deps.sessao is not None:
        frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is not None and frame.size > 0:
            frame_id = deps.slot.ultimo()[0] if deps.slot.ultimo() else None
            deps.sessao.atualizar(ultimo_frame=frame, ultimo_frame_id=frame_id)

    return {"status": "ok"}
