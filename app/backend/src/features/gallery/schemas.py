from __future__ import annotations

from pydantic import BaseModel, Field


class RemovedIn(BaseModel):
    kind: str
    path: str = ""


class FavoriteIn(BaseModel):
    favorite: bool


class LibraryIn(BaseModel):
    name: str = ""
    query: str = ""
    scopes: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    loras: list[str] = Field(default_factory=list)
    wildcards: list[str] = Field(default_factory=list)
    kind: str | None = None
    parent_id: str | None = None


class LibraryOrderIn(BaseModel):
    parent_id: str | None = None
    ids: list[str] = Field(default_factory=list)

