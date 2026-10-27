from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel

from .exceptions import OllamaSchemaValidationError
from .models import MarkdownDefinition, SkillExecutionRequest
from .ollama_client import OllamaClient


class OllamaSkillExecutor:
    def __init__(self, client: OllamaClient):
        self.client = client

    async def execute(self, request: SkillExecutionRequest, definition: MarkdownDefinition, output_model: type[BaseModel]):
        if request.image is None:
            raise ValueError("Skill Ollama exige imagem")

        payload = {
            "objeto_alvo": request.input_data.get("objeto_alvo"),
            "ultima_descricao": request.input_data.get("ultima_descricao"),
            "objetos_recentes": request.input_data.get("objetos_recentes"),
            "pergunta": request.input_data.get("pergunta"),
            "regioes_alteradas": request.input_data.get("regioes_alteradas"),
        }
        if (
            request.skill_name != "identify-change"
            and request.input_data.get("indice_mudanca_visual") is not None
        ):
            payload["indice_mudanca_visual"] = request.input_data[
                "indice_mudanca_visual"
            ]

        model = definition.metadata.get("model")
        if model is not None and (not isinstance(model, str) or not model.strip()):
            raise ValueError(f"Modelo inválido para skill {definition.name}")

        raw = await self.client.analyze_image(
            image=request.image,
            previous_image=request.previous_image,
            model=model,
            system_instructions=definition.instructions,
            input_data=payload,
            output_schema=output_model.model_json_schema(),
            correlation_id=request.correlation_id,
        )

        try:
            data = output_model.model_validate_json(raw)
        except Exception as exc:
            raise OllamaSchemaValidationError(f"Resposta inválida para {definition.name}: {raw}") from exc

        return data
