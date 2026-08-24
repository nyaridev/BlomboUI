from __future__ import annotations

from pydantic import BaseModel, Field


class CivitaiDownloadIn(BaseModel):
    modelId: int = Field(gt=0)
    versionId: int = Field(gt=0)
    fileId: int | None = Field(default=None, gt=0)
    customNaming: bool = False
    modelName: str = ""
    creatorAlias: str = ""
