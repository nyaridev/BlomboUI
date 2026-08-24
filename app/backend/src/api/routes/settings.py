from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from features.settings import service as settings
from shared import dirs

api = APIRouter()


@api.get("/user-settings")
def get_settings() -> dict:
    return {"settings": settings.load()}


@api.put("/user-settings")
def put_settings(body: dict[str, Any]) -> dict:
    data = settings.save(body)
    dirs.write_extra_model_paths()
    return {"settings": data}
