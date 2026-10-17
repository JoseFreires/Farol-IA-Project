import base64
from collections.abc import AsyncIterator

from google import genai
from google.genai import types
from ollama import AsyncClient

from .config import settings
from .prompts import montar_system
from .schemas import DescreverRequest

MAX_TOKENS = 800


async def _gemini(req: DescreverRequest) -> AsyncIterator[str]:
    client = genai.Client(api_key=settings.gemini_api_key)
    imagem = base64.b64decode(req.imagem_base64)

    contents = [types.Content(role="user", parts=[
        types.Part.from_bytes(data=imagem, mime_type="image/jpeg"),
        types.Part.from_text(text="Descreva o que a câmera está vendo, seguindo o modo indicado."),
    ])]
    for m in req.historico:
        papel = "model" if m.role == "assistant" else "user"
        contents.append(types.Content(role=papel, parts=[types.Part.from_text(text=m.texto)]))
    if req.pergunta:
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=req.pergunta)]))

    stream = await client.aio.models.generate_content_stream(
        model=settings.gemini_model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=montar_system(req.modo),
            max_output_tokens=MAX_TOKENS,
        ),
    )
    async for chunk in stream:
        if chunk.text:
            yield chunk.text


async def _ollama(req: DescreverRequest) -> AsyncIterator[str]:
    client = AsyncClient(host=settings.ollama_host)

    mensagens = [
        {"role": "system", "content": montar_system(req.modo)},
        {"role": "user",
         "content": "Descreva o que a câmera está vendo, seguindo o modo indicado.",
         "images": [req.imagem_base64]},
    ]
    for m in req.historico:
        mensagens.append({"role": m.role, "content": m.texto})
    if req.pergunta:
        mensagens.append({"role": "user", "content": req.pergunta})

    stream = await client.chat(
        model=settings.ollama_model,
        messages=mensagens,
        stream=True,
        options={"num_predict": MAX_TOKENS, "temperature": 0.2},
    )
    async for parte in stream:
        texto = parte["message"]["content"]
        if texto:
            yield texto


async def descrever_stream(req: DescreverRequest) -> AsyncIterator[str]:
    fonte = _gemini if settings.provedor == "gemini" else _ollama
    async for pedaco in fonte(req):
        yield pedaco