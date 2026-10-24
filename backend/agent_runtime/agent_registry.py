from __future__ import annotations

from pathlib import Path

from .exceptions import AgentNotFoundError, SkillNotFoundError
from .markdown_loader import MarkdownLoader
from .models import AgentRegistration, MarkdownDefinition


class AgentRegistry:
    def __init__(self, markdown_loader: MarkdownLoader):
        self._loader = markdown_loader
        self._registrations: dict[str, AgentRegistration] = {}

    def register(self, registration: AgentRegistration) -> None:
        self._registrations[registration.name] = registration

    def get(self, name: str) -> AgentRegistration:
        if name not in self._registrations:
            raise AgentNotFoundError(f"Agente não registrado: {name}")
        return self._registrations[name]

    def load_definition(self, name: str) -> MarkdownDefinition:
        registration = self.get(name)
        if not registration.definition_path.exists():
            raise AgentNotFoundError(f"Arquivo do agente não encontrado: {registration.definition_path}")
        return self._loader.load_agent(registration.definition_path)

    def allowed_skills(self, name: str) -> frozenset[str]:
        return self.get(name).allowed_skills
