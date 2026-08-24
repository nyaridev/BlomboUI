from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class WildcardFileIn(BaseModel):
    lines: list[str] | None = None
    tree: dict[str, Any] | None = None
    text: str | None = None


class WildcardCreateIn(BaseModel):
    folder: str = ""
    name: str


class WildcardPathIn(BaseModel):
    path: str = ""


class WildcardRenameIn(BaseModel):
    path: str = ""
    name: str


class WildcardMoveIn(BaseModel):
    path: str = ""
    folder: str = ""
