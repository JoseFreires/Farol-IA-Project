from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from src.farol.contratos import Origem
from src.farol.contexto import vars_pergunta
from src.farol.filtro import jpeg, recortar
from src.farol.mensagens import msg_erro, msg_resposta
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
        if deps.fila_saida is not None:
            deps.fila_saida.publicar(msg_erro(RuntimeError("Ainda não recebi imagem da câmera.")), interrompe=True)
        return {"status": "recebida"}

    objetos = list(getattr(estado, "ultimo_json", ()) or ())
    decisao = rotear_pergunta(texto, objetos, estado)
    frame_id = getattr(estado, "ultimo_frame_id", None)

    if deps.cfg.get("pergunta", {}).get("sempre_llm", False) and decisao.caminho == 1 and decisao.resposta_direta:
        decisao = decisao.__class__(caminho=2, intencao=decisao.intencao, classe_alvo_en=decisao.classe_alvo_en, termo_pt=decisao.termo_pt)

    if decisao.caminho == 1 and decisao.resposta_direta:
        if deps.fila_saida is not None:
            deps.fila_saida.publicar(
                msg_resposta(decisao.resposta_direta, Origem.SOMENTE_YOLO, frame_id),
                interrompe=False,
            )
        if sessao is not None:
            sessao.atualizar(ultima_pergunta=texto)
        return {"status": "recebida"}

    if deps.fila_llm is None or deps.skills is None or "responder-pergunta" not in deps.skills:
        if deps.fila_saida is not None:
            deps.fila_saida.publicar(msg_erro(RuntimeError("Modelo Gemma não configurado.")), interrompe=True)
        return {"status": "recebida"}

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

    def ao_concluir(resposta: str) -> None:
        if deps.fila_saida is not None:
            deps.fila_saida.publicar(msg_resposta(resposta, Origem.VLM, frame_id), interrompe=False)

    def ao_erro(exc: Exception) -> None:
        if deps.fila_saida is not None:
            deps.fila_saida.publicar(msg_erro(exc), interrompe=True)

    if sessao is not None:
        sessao.atualizar(ultima_pergunta=texto)

    deps.fila_llm.enfileirar(
        deps.skills["responder-pergunta"],
        variaveis,
        prioridade=1,
        imagem=imagem,
        ao_concluir=ao_concluir,
        ao_erro=ao_erro,
    )
    return {"status": "recebida"}
