from __future__ import annotations

from pydantic import BaseModel, Field


class RemovedIn(BaseModel):
    kind: str
    path: str = ""


class LibraryIn(BaseModel):
    name: str = ""
    query: str = ""
    scopes: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)

