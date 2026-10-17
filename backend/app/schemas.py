from typing import Literal

from pydantic import BaseModel, Field


class Mensagem(BaseModel):
    role: Literal["user", "assistant"]
    texto: str = Field(max_length=4000)


class DescreverRequest(BaseModel):
    imagem_base64: str = Field(max_length=6_000_000)
    modo: Literal["ambiente", "texto", "produto", "documento"] = "ambiente"
    pergunta: str | None = Field(default=None, max_length=500)
    historico: list[Mensagem] = Field(default_factory=list, max_length=20)


class BoletoRequest(BaseModel):
    codigo: str = Field(max_length=100)