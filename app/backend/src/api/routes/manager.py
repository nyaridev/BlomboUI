from __future__ import annotations

from fastapi import APIRouter

from api.errors import ApiError
from features.models import service as models
from features.models.schemas import ManagerInstallIn

api = APIRouter()


@api.get("/manager/models")
def get_manager_models(mode: str = "cache") -> dict:
    try:
        return models.list_manager_models(mode)
    except models.ManagerCatalogError as exc:
        raise ApiError(exc.code, str(exc), exc.status) from exc


@api.post("/manager/models/install")
def post_manager_install(body: ManagerInstallIn) -> dict:
    try:
        return models.install_manager_model(body.name, body.filename, body.save_path)
    except models.ManagerCatalogError as exc:
        raise ApiError(exc.code, str(exc), exc.status) from exc
