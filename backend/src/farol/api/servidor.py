from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from fastapi import FastAPI

from src.farol.api.rota_frames import router as router_frames
from src.farol.api.rota_perguntas import router as router_perguntas


logger = logging.getLogger(__name__)


@dataclass
class Deps:
    slot: object
    sessao: object
    fila_llm: object
    fila_saida: object
    skills: dict
    cfg: dict
    parar: object


def criar_app(deps: Deps) -> FastAPI:
    app = FastAPI(title="Farol")
    app.state.deps = deps
    app.include_router(router_frames)
    app.include_router(router_perguntas)
    return app
