import base64
import io
import json
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image

from .boleto import validar_boleto
from .config import settings
from .schemas import BoletoRequest, DescreverRequest
from .vision import descrever_stream

app = FastAPI(title="Descritor")


def autenticar(authorization: str = Header(default="")) -> None:
    esperado = f"Bearer {settings.app_token}"
    if not secrets.compare_digest(authorization, esperado):
        raise HTTPException(status_code=401, detail="Não autorizado")


def validar_imagem(b64: str) -> None:
    try:
        dados = base64.b64decode(b64, validate=True)
        img = Image.open(io.BytesIO(dados))
        img.verify()
        if img.format != "JPEG":
            raise ValueError("formato")
    except Exception:
        raise HTTPException(status_code=400, detail="Imagem inválida")


def _evento(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/descrever", dependencies=[Depends(autenticar)])
async def descrever(req: DescreverRequest):
    validar_imagem(req.imagem_base64)

    async def eventos():
        try:
            async for pedaco in descrever_stream(req):
                yield _evento({"texto": pedaco})
            yield "data: [FIM]\n\n"
        except Exception:
            yield _evento({"erro": "O serviço está indisponível agora. Tente de novo em instantes."})

    return StreamingResponse(eventos(), media_type="text/event-stream")


@app.post("/boleto/validar", dependencies=[Depends(autenticar)])
def boleto_validar(req: BoletoRequest):
    return validar_boleto(req.codigo)