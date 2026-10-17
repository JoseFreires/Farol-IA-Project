from collections.abc import AsyncIterator
import asyncio

from ollama import AsyncClient

from .config import settings
from .prompts import montar_system
from .schemas import DescreverRequest
from .ocr import ler_texto

client = AsyncClient(host=settings.ollama_host)

OPCOES = {
    "num_predict": 500,
    "temperature": 0.2,
    "num_ctx": settings.ollama_num_ctx,
}


async def aquecer() -> None:
    """Carrega o modelo na memória antes do primeiro uso."""
    await client.chat(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": "ok"}],
        keep_alive=settings.ollama_keep_alive,
        options={"num_predict": 1},
    )


def _mensagens(req: DescreverRequest, ocr: str = "") -> list[dict]:
    pedido = "Descreva o que a câmera está vendo, seguindo o modo indicado. Responda em português do Brasil."
    if ocr:
        pedido += (
            "\n\nUm leitor automático extraiu este texto da imagem. "
            "Ele pode conter erros, então confira com a imagem e não repita o que não tiver certeza:\n"
            + ocr[:1500]
        )
    msgs: list[dict] = [
        {"role": "system", "content": montar_system(req.modo)},
        {"role": "user", "content": pedido, "images": [req.imagem_base64]},
    ]
    for m in req.historico:
        msgs.append({"role": m.role, "content": m.texto})
    if req.pergunta:
        msgs.append({"role": "user", "content": req.pergunta})
    return msgs


async def descrever_stream(req: DescreverRequest) -> AsyncIterator[str]:
    ocr = ""
    if req.modo in ("texto", "produto", "documento"):
        ocr = await asyncio.to_thread(ler_texto, req.imagem_base64)

    stream = await client.chat(
        model=settings.ollama_model,
        messages=_mensagens(req, ocr),
        stream=True,
        keep_alive=settings.ollama_keep_alive,
        options=OPCOES,
    )
    async for parte in stream:
        texto = parte["message"]["content"]
        if texto:
            yield texto