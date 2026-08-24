from __future__ import annotations

from pydantic import BaseModel


class RemovedIn(BaseModel):
    kind: str
    path: str = ""
