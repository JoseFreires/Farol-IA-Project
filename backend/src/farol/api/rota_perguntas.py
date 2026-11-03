from __future__ import annotations

import asyncio
from concurrent.futures import Future
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from src.farol.contexto import vars_pergunta
from src.farol.filtro import jpeg, recortar
from src.farol.pergunta.roteador import rotear_pergunta


logger = logging.getLogger(__name__)
router = APIRouter()


class PerguntaPayload(BaseModel):
    texto: str


@router.post("/pergunta")
async def pergunta(request: Request, payload: PerguntaPayload):
    deps = request.app.state.deps
    texto = payload.texto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="texto obrigatório")
    texto = texto[6:].strip() if texto.lower().startswith("farol") else texto
    if not texto:
        raise HTTPException(status_code=422, detail="texto obrigatório")

    sessao = getattr(deps, "sessao", None)
    estado = getattr(sessao, "estado", None) if sessao is not None else None
    frame = getattr(estado, "ultimo_frame", None) if estado is not None else None
    if frame is None:
        raise HTTPException(status_code=409, detail="Ainda não recebi imagem da câmera.")

    objetos = list(getattr(estado, "ultimo_json", ()) or ())
    decisao = rotear_pergunta(texto, objetos, estado)
    frame_id = getattr(estado, "ultimo_frame_id", None)

    if deps.cfg.get("pergunta", {}).get("sempre_llm", False) and decisao.caminho == 1 and decisao.resposta_direta:
        decisao = decisao.__class__(caminho=2, intencao=decisao.intencao, classe_alvo_en=decisao.classe_alvo_en, termo_pt=decisao.termo_pt)

    if decisao.caminho == 1 and decisao.resposta_direta:
        if sessao is not None:
            sessao.atualizar(ultima_pergunta=texto)
        return {"frameId": frame_id, "texto": decisao.resposta_direta}

    if deps.fila_llm is None or deps.skills is None or "responder-pergunta" not in deps.skills:
        raise HTTPException(status_code=503, detail="Modelo Gemma não configurado.")

    alvo = None
    for obj in objetos:
        if getattr(obj, "classe_yolo", None) == decisao.classe_alvo_en:
            alvo = obj
            break

    recorte = frame
    if alvo is not None and getattr(alvo, "bbox", None) is not None:
        margem = (
            float(deps.cfg.get("yolo_degraus", {}).get("margem_recorte", 0.25))
            if decisao.classe_alvo_en == "degrau"
            else 0.15
        )
        recorte = recortar(frame, alvo.bbox, margem=margem)

    cfg_llm = deps.cfg.get("llm", {})
    imagem = jpeg(recorte, qualidade=int(cfg_llm.get("jpeg_qualidade", 80)), max_lado=int(cfg_llm.get("jpeg_max_lado", 640)))
    variaveis = vars_pergunta(
        texto,
        objetos,
        alertados=getattr(estado, "riscos_alertados", set()),
    )

    resultado: Future[str] = Future()

    def ao_concluir(resposta: str) -> None:
        if not resultado.done():
            resultado.set_result(resposta)

    def ao_erro(exc: Exception) -> None:
        if not resultado.done():
            resultado.set_exception(exc)

    if sessao is not None:
        sessao.atualizar(ultima_pergunta=texto)

    try:
        deps.fila_llm.enfileirar(
            deps.skills["responder-pergunta"],
            variaveis,
            prioridade=1,
            imagem=imagem,
            ao_concluir=ao_concluir,
            ao_erro=ao_erro,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    timeout = float(deps.cfg.get("api", {}).get("timeout_pergunta_s", 60))
    try:
        resposta = await asyncio.wait_for(asyncio.wrap_future(resultado), timeout)
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504, detail="tempo limite aguardando resposta do modelo"
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"frameId": frame_id, "texto": resposta}
