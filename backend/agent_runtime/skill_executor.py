from __future__ import annotations

import json
import time
from typing import Any

from pydantic import BaseModel

from .exceptions import OllamaSchemaValidationError, SkillInvalidDefinitionError, SkillNotFoundError
from .executor_registry import ExecutorRegistry
from .models import MarkdownDefinition, SkillExecutionRequest, SkillExecutionResult
from .skill_registry import SkillRegistry


class SkillExecutor:
    def __init__(self, skill_registry: SkillRegistry, executor_registry: ExecutorRegistry):
        self.skill_registry = skill_registry
        self.executor_registry = executor_registry

    async def execute(
        self,
        *,
        agent_name: str,
        request: SkillExecutionRequest,
        output_model: type[BaseModel],
    ) -> SkillExecutionResult:
        definition = self.skill_registry.get_definition(request.skill_name)
        executor = self.executor_registry.get(definition.executor or "ollama")

        started = time.perf_counter()
        try:
            resultado = await executor.execute(request, definition, output_model)
            duration_ms = int((time.perf_counter() - started) * 1000)
            return SkillExecutionResult(
                skill_name=request.skill_name,
                data=resultado,
                success=True,
                duration_ms=duration_ms,
            )
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            return SkillExecutionResult(
                skill_name=request.skill_name,
                data=None,
                success=False,
                duration_ms=duration_ms,
                error_code="SKILL_EXECUTION_FAILED",
                error_detail=str(exc),
            )
