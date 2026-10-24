from __future__ import annotations

from typing import Protocol

from .exceptions import SkillNotFoundError


class SkillExecutorProtocol(Protocol):
    async def execute(self, request, definition, output_model):
        ...


class ExecutorRegistry:
    def __init__(self):
        self._executors: dict[str, SkillExecutorProtocol] = {}

    def register(self, name: str, executor: SkillExecutorProtocol) -> None:
        self._executors[name] = executor

    def get(self, name: str) -> SkillExecutorProtocol:
        if name not in self._executors:
            raise SkillNotFoundError(f"Executor não registrado: {name}")
        return self._executors[name]
