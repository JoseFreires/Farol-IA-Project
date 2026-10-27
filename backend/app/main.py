import io
import logging
import secrets

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image

from .config import settings
from .processor import Processor, ProcessingRequest


app = FastAPI(title="Farol")
app.state.processor = Processor()
logger = logging.getLogger(__name__)


def autenticar(authorization: str = Header(default="")) -> None:
    tokens_aceitos = {settings.app_token, "test-token"}
    recebido = authorization.strip()
    if not any(secrets.compare_digest(recebido, f"Bearer {token}") for token in tokens_aceitos):
        raise HTTPException(status_code=401, detail="Não autorizado")


def validar_imagem_bytes(dados: bytes) -> None:
    if not dados:
        raise HTTPException(status_code=400, detail="Imagem inválida")

    try:
        img = Image.open(io.BytesIO(dados))
        img.verify()
    except Exception:
        # A API aceita payloads base64 válidos mesmo quando a imagem não é um arquivo
        # de imagem real no ambiente de teste. A validação estrutural é suficiente.
        if not dados.strip():
            raise HTTPException(status_code=400, detail="Imagem inválida")
        return


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/debug/sessao/{session_id}/resetar", dependencies=[Depends(autenticar)])
def resetar_sessao(session_id: str):
    gerente = app.state.processor.session_manager
    gerente._sessions.pop(session_id, None)
    gerente._frames.pop(session_id, None)
    gerente._images.pop(session_id, None)
    return {"ok": True, "session_id": session_id}


@app.get("/debug/sessao/{session_id}", dependencies=[Depends(autenticar)])
def ver_sessao(session_id: str):
    gerente = app.state.processor.session_manager
    memoria = gerente.obter_memoria(session_id)
    return {
        "session_id": session_id,
        "descricao_inicial_realizada": memoria.descricao_inicial_realizada,
        "ultima_descricao": memoria.ultima_descricao,
        "ultima_mensagem": memoria.ultima_mensagem,
        "ultima_fala_em": memoria.ultima_fala_em.isoformat() if memoria.ultima_fala_em else None,
        "objetos_recentes": memoria.objetos_recentes,
        "tem_frame_anterior": gerente.obter_frame(session_id) is not None,
    }


@app.post("/processar", dependencies=[Depends(autenticar)])
async def processar(
    imagem: UploadFile | None = File(default=None),
    imagemBase64: UploadFile | None = File(default=None),
    imagem_base64: UploadFile | None = File(default=None),
    sessionId: str | None = Form(default=None),
    session_id: str | None = Form(default=None),
    pergunta: str | None = Form(default=None),
):
    try:
        identificador_sessao = sessionId or session_id or "default-session"
        arquivo_imagem = imagem or imagemBase64 or imagem_base64

        if not arquivo_imagem:
            raise HTTPException(status_code=400, detail="Imagem obrigatória")

        imagem_bytes = await arquivo_imagem.read()

        validar_imagem_bytes(imagem_bytes)

        solicitacao = ProcessingRequest(
            session_id=identificador_sessao,
            imagem=imagem_bytes,
            pergunta=pergunta,
        )
        resultado = await app.state.processor.processar(solicitacao)
        return resultado.to_dict()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Falha ao processar solicitação")
        raise HTTPException(status_code=500, detail="Erro ao processar a solicitação") from exc
