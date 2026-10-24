from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from .exceptions import (
    MarkdownExecutorNotAllowedError,
    MarkdownInvalidFrontmatterError,
    MarkdownNameMismatchError,
    MarkdownNotFoundError,
    MarkdownOutsideAllowedRootError,
    MarkdownRequiredFieldMissingError,
    MarkdownTooLargeError,
)
from .models import MarkdownDefinition


class MarkdownLoader:
    def __init__(self, allowed_roots: tuple[Path, ...], max_file_bytes: int = 64_000):
        self.allowed_roots = tuple(Path(root).resolve() for root in allowed_roots)
        self.max_file_bytes = max_file_bytes
        self._cache: dict[Path, MarkdownDefinition] = {}

    def load_agent(self, file_path: Path) -> MarkdownDefinition:
        return self._load(file_path, "agent")

    def load_skill(self, file_path: Path) -> MarkdownDefinition:
        return self._load(file_path, "skill")

    def clear_cache(self) -> None:
        self._cache.clear()

    def _load(self, file_path: Path, definition_type: str) -> MarkdownDefinition:
        resolved = Path(file_path).resolve()
        if not resolved.exists():
            raise MarkdownNotFoundError(f"Markdown não encontrado: {resolved}")
        if not resolved.is_file():
            raise MarkdownNotFoundError(f"Arquivo Markdown inválido: {resolved}")
        if resolved.suffix.lower() != ".md":
            raise MarkdownInvalidFrontmatterError(f"Arquivo não é Markdown: {resolved}")
        if not self._is_allowed(resolved):
            raise MarkdownOutsideAllowedRootError(f"Arquivo fora da raiz permitida: {resolved}")

        if resolved.stat().st_size > self.max_file_bytes:
            raise MarkdownTooLargeError(f"Markdown excede o limite: {resolved}")

        if resolved in self._cache:
            return self._cache[resolved]

        content = resolved.read_text(encoding="utf-8")
        if not content.strip():
            raise MarkdownInvalidFrontmatterError("Arquivo Markdown vazio")

        frontmatter, instructions = self._split_frontmatter(content)
        data = self._parse_frontmatter(frontmatter)
        name = str(data.get("name") or "").strip()
        description = str(data.get("description") or "").strip()
        executor = str(data.get("executor") or "").strip() or None
        if not name:
            raise MarkdownRequiredFieldMissingError("Campo 'name' obrigatório")
        if not description:
            raise MarkdownRequiredFieldMissingError("Campo 'description' obrigatório")
        if not instructions or not instructions.strip():
            raise MarkdownRequiredFieldMissingError("Campo de instruções obrigatório")

        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
            raise MarkdownInvalidFrontmatterError(f"Nome inválido: {name}")

        if definition_type == "skill":
            expected = resolved.parent.name
            if name != expected:
                raise MarkdownNameMismatchError(
                    f"Nome do skill '{name}' deve coincidir com o diretório '{expected}'"
                )

        allowed_executors = {"ollama", "python"}
        if executor is not None and executor not in allowed_executors:
            raise MarkdownExecutorNotAllowedError(f"Executor não permitido: {executor}")

        definition = MarkdownDefinition(
            name=name,
            description=description,
            instructions=instructions.strip(),
            file_path=resolved,
            definition_type=definition_type,
            version=str(data.get("version")) if data.get("version") is not None else None,
            language=str(data.get("language") or "pt-BR"),
            executor=executor,
            metadata={k: v for k, v in data.items() if k not in {"name", "description", "version", "language", "executor"}},
        )

        self._cache[resolved] = definition
        return definition

    def _split_frontmatter(self, content: str) -> tuple[str, str]:
        if not content.startswith("---\n") and not content.startswith("---\r\n"):
            raise MarkdownInvalidFrontmatterError("Frontmatter ausente")
        marker = "\n---\n" if "\n---\n" in content else "\r\n---\r\n"
        if marker not in content:
            raise MarkdownInvalidFrontmatterError("Frontmatter incompleto")
        frontmatter, instructions = content.split(marker, 1)
        frontmatter = frontmatter.replace("---", "", 1).strip()
        if not frontmatter:
            raise MarkdownInvalidFrontmatterError("Frontmatter vazio")
        return frontmatter, instructions.strip()

    def _parse_frontmatter(self, raw: str) -> dict[str, Any]:
        try:
            return yaml.safe_load(raw) or {}
        except Exception as exc:
            raise MarkdownInvalidFrontmatterError("Frontmatter YAML inválido") from exc

    def _is_allowed(self, path: Path) -> bool:
        return any(path.is_relative_to(root) for root in self.allowed_roots)
