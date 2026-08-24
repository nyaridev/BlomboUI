from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ModelInfoUpdate(BaseModel):
    types: list[str] = Field(default_factory=list)
    prompt: str | None = None
    negative_prompt: str | None = None
    notes: str | None = None
    strength: float | None = None
    slider: bool | None = None
    auto_apply: bool | None = None
    apply_at: Literal["start", "end"] | None = None


class ModelFolderIn(BaseModel):
    folder: str = ""
    name: str


class ModelPathIn(BaseModel):
    path: str = ""


class ModelRenameIn(BaseModel):
    path: str = ""
    name: str


class ModelMoveIn(BaseModel):
    path: str = ""
    folder: str = ""


class ScopeIn(BaseModel):
    name: str = ""
    group: str = ""
    anyGroups: list[list[str]] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)
    priority: int = 0
