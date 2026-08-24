from __future__ import annotations

from pydantic import BaseModel


class AutocompleteCsvIn(BaseModel):
    name: str
