from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect

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
    if deps.fila_saida is None:
        raise HTTPException(status_code=503, detail="fila de saída indisponível")
    cfg_api = deps.cfg.get("api", {})
    frame = captura.decodificar_frame(
        payload, cfg_api.get("frame_max_bytes", 2_000_000)
    )
    if frame is None:
        raise HTTPException(status_code=400, detail="frame inválido")

    frame_id = deps.slot.publicar(
        frame,
        requisicao=True,
        ao_registrar=deps.fila_saida.registrar_frame,
    )
    if deps.sessao is not None:
        deps.sessao.atualizar(ultimo_frame=frame, ultimo_frame_id=frame_id)

    timeout = float(cfg_api.get("timeout_processamento_s", 30))
    mensagens = await asyncio.to_thread(
        deps.fila_saida.aguardar_frame, frame_id, timeout
    )
    if mensagens is None:
        if deps.slot.cancelar_requisicao(frame_id):
            deps.fila_saida.descartar_frame(frame_id)
        raise HTTPException(
            status_code=504,
            detail="tempo limite aguardando o processamento do frame",
        )

    falas = [
        mensagem
        for mensagem in mensagens
        if mensagem.deveFalar and mensagem.mensagem.strip()
    ]
    if not falas:
        return Response(status_code=204)
    mensagem = min(falas, key=lambda item: (int(item.prioridade), item.timestamp))
    return {"frameId": frame_id, "texto": mensagem.mensagem}


@router.get("/saida")
async def proxima_saida(request: Request):
    deps = request.app.state.deps
    if deps.fila_saida is None:
        raise HTTPException(status_code=503, detail="fila de saída indisponível")
    mensagem = deps.fila_saida.proxima()
    if mensagem is None:
        return {"status": "vazia"}
    return mensagem.to_dict()
