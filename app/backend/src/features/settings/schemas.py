from __future__ import annotations

from pydantic import BaseModel, Field


class OutputPathIn(BaseModel):
    path: str


class PathsCheckIn(BaseModel):
    paths: list[str] = Field(default_factory=list)
