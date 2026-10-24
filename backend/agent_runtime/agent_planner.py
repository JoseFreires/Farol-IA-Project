from __future__ import annotations

import json

from pydantic import BaseModel

from .exceptions import OllamaSchemaValidationError
from .models import AgentPlan, SkillCall
from .ollama_client import OllamaClient


class AgentPlanner:
    def __init__(self, client: OllamaClient):
        self.client = client

    async def plan(self, *, system_instructions: str, input_data: dict, allowed_skills: list[str], correlation_id: str) -> AgentPlan:
        payload = {
            "pergunta": input_data.get("pergunta"),
            "historico": input_data.get("historico"),
            "memoria": input_data.get("memoria"),
            "allowed_skills": allowed_skills,
            "max_skills_per_request": 1,
        }
        raw = await self.client.plan(
            system_instructions=system_instructions,
            input_data=payload,
            output_schema=AgentPlan.model_json_schema(),
            correlation_id=correlation_id,
        )
        try:
            plan = AgentPlan.model_validate_json(raw)
        except Exception as exc:
            raise OllamaSchemaValidationError(f"Plano inválido recebido do Ollama: {raw}") from exc
        return plan
