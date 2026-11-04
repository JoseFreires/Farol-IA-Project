from __future__ import annotations

import asyncio
import logging
import time
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
    iniciou_em = time.monotonic()
    quadros = 0
    bytes_recebidos = 0
    quadros_invalidos = 0
    logger.info("auditoria ws_frames conectado cliente=%s", websocket.client)
    try:
        while True:
            dados = await websocket.receive_bytes()
            if not deps.slot:
                continue
            bytes_recebidos += len(dados)
            aceito = captura.ingerir_frame(
                deps.slot,
                dados,
                deps.cfg.get("api", {}).get("frame_max_bytes", 2_000_000),
            )
            if aceito:
                quadros += 1
            else:
                quadros_invalidos += 1

            agora = time.monotonic()
            intervalo = agora - iniciou_em
            if intervalo >= 5:
                logger.info(
                    "auditoria ws_frames atividade cliente=%s quadros_aceitos=%d "
                    "quadros_invalidos=%d bytes=%d taxa_fps=%.2f intervalo_s=%.1f",
                    websocket.client,
                    quadros,
                    quadros_invalidos,
                    bytes_recebidos,
                    quadros / intervalo,
                    intervalo,
                )
                iniciou_em = agora
                quadros = 0
                bytes_recebidos = 0
                quadros_invalidos = 0
    except WebSocketDisconnect:
        logger.info(
            "auditoria ws_frames desconectado cliente=%s quadros_aceitos=%d "
            "quadros_invalidos=%d bytes=%d",
            websocket.client,
            quadros,
            quadros_invalidos,
            bytes_recebidos,
        )
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
        logger.warning(
            "auditoria frame_upload rejeitado bytes=%d motivo=frame_invalido",
            len(payload),
        )
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
        logger.warning(
            "auditoria frame_upload timeout frame_id=%d timeout_s=%.1f",
            frame_id,
            timeout,
        )
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
        logger.info(
            "auditoria frame_upload concluido frame_id=%d status=sem_mensagem mensagens=%d",
            frame_id,
            len(mensagens),
        )
        return Response(status_code=204)
    mensagem = min(falas, key=lambda item: (int(item.prioridade), item.timestamp))
    logger.info(
        "auditoria frame_upload resposta frame_id=%d motivo=%s prioridade=%d",
        frame_id,
        mensagem.motivo,
        int(mensagem.prioridade),
    )
    return {"frameId": frame_id, "texto": mensagem.mensagem}


@router.get("/saida")
async def proxima_saida(request: Request):
    deps = request.app.state.deps
    if deps.fila_saida is None:
        raise HTTPException(status_code=503, detail="fila de saída indisponível")
    mensagem = deps.fila_saida.proxima()
    if mensagem is None:
        logger.debug("auditoria saida status=vazia")
        return {"status": "vazia"}
    logger.info(
        "auditoria saida entregue session_id=%s frame_id=%s motivo=%s prioridade=%d "
        "origem=%s expira_em_ms=%d mensagem=%r",
        mensagem.sessionId,
        mensagem.frameId,
        mensagem.motivo,
        int(mensagem.prioridade),
        mensagem.origem,
        mensagem.expiraEmMs,
        mensagem.mensagem,
    )
    return mensagem.to_dict()
