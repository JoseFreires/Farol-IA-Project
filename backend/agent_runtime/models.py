from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


@dataclass(frozen=True, slots=True)
class MarkdownDefinition:
    name: str
    description: str
    instructions: str
    file_path: Path
    definition_type: Literal["agent", "skill"]
    version: str | None = None
    language: str = "pt-BR"
    executor: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SkillSummary:
    name: str
    description: str
    executor: str


class SkillCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentPlan(BaseModel):
    skills: list[SkillCall] = Field(min_length=1, max_length=3)
    resumo: str | None = None


@dataclass(frozen=True, slots=True)
class SkillExecutionRequest:
    skill_name: str
    image: bytes | None
    input_data: dict[str, Any]
    session_id: str
    correlation_id: str


@dataclass(frozen=True, slots=True)
class SkillExecutionResult:
    skill_name: str
    data: object | None
    success: bool
    duration_ms: int
    error_code: str | None = None
    error_detail: str | None = None


@dataclass(frozen=True, slots=True)
class AgentRegistration:
    name: str
    definition_path: Path
    allowed_skills: frozenset[str]
    max_skills_per_request: int = 1
