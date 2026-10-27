from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class MarkdownDefinition:
    name: str
    description: str
    instructions: str
    file_path: Path
    version: str | None = None
    language: str = "pt-BR"
    executor: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SkillSummary:
    name: str
    description: str
    executor: str


@dataclass(frozen=True, slots=True)
class SkillExecutionRequest:
    skill_name: str
    image: bytes | None
    input_data: dict[str, Any]
    session_id: str
    correlation_id: str
    previous_image: bytes | None = None


@dataclass(frozen=True, slots=True)
class SkillExecutionResult:
    skill_name: str
    data: object | None
    success: bool
    duration_ms: int
    error_code: str | None = None
    error_detail: str | None = None
