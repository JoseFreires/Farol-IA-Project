from __future__ import annotations

from pathlib import Path

from .exceptions import SkillDuplicateNameError, SkillInvalidDefinitionError, SkillNotFoundError
from .markdown_loader import MarkdownLoader
from .models import SkillSummary


class SkillRegistry:
    def __init__(self, root: Path, loader: MarkdownLoader):
        self.root = Path(root).resolve()
        self.loader = loader
        self._definitions: dict[str, object] = {}
        self._summaries: dict[str, SkillSummary] = {}

    def discover(self) -> None:
        if not self.root.exists():
            raise SkillInvalidDefinitionError(f"Raiz de skills não encontrada: {self.root}")

        found: dict[str, object] = {}
        for skill_dir in sorted(self.root.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_file = skill_dir / "SKILL.md"
            if not skill_file.exists():
                continue
            definition = self.loader.load_skill(skill_file)
            if definition.name in found:
                raise SkillDuplicateNameError(f"Skill duplicada: {definition.name}")
            found[definition.name] = definition

        self._definitions = found
        self._summaries = {
            name: SkillSummary(
                name=definition.name,
                description=definition.description,
                executor=definition.executor or "ollama",
            )
            for name, definition in found.items()
        }

    def get_definition(self, name: str):
        if name not in self._definitions:
            raise SkillNotFoundError(f"Skill não encontrada: {name}")
        return self._definitions[name]

    def get_summary(self, name: str) -> SkillSummary:
        if name not in self._summaries:
            raise SkillNotFoundError(f"Skill não encontrada: {name}")
        return self._summaries[name]

    def list_summaries(self, allowed_names: set[str] | None = None) -> tuple[SkillSummary, ...]:
        names = self._summaries if allowed_names is None else {k: v for k, v in self._summaries.items() if k in allowed_names}
        return tuple(names.values())

    def contains(self, name: str) -> bool:
        return name in self._definitions
