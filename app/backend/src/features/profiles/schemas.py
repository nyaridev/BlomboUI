from __future__ import annotations

from pydantic import BaseModel, Field


class ProfileCreateIn(BaseModel):
    displayName: str = Field(min_length=1, max_length=40)


class ProfileRenameIn(BaseModel):
    displayName: str = Field(min_length=1, max_length=40)
