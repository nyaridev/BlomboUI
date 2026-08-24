from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

if os.environ.get("BLOMBO_API_PINGS") != "1":
    logging.getLogger("uvicorn.access").disabled = True

from blombo import cache_db, db
from blombo.generate import comfy, templates
from blombo.gallery import removed
from blombo.models import hashes, models, thumbnail_scopes
from blombo.complete import tag_complete
from blombo.paths import RUNTIME
from blombo.routes.common import ApiError, error_json
from blombo.routes import civitai, complete, core, gallery, generate, models as model_routes, wildcards


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.connect()
    cache_db.connect()
    thumbnail_scopes.list_scopes()
    tag_complete.schedule_rebuild()
    hashes.start()
    hashes.warm(models.hash_files())
    try:
        removed.purge_expired()
    except OSError:
        pass
    yield
    hashes.stop()


app = FastAPI(title="BlomboUI", lifespan=lifespan)


@app.exception_handler(ApiError)
async def api_error(_request: Any, exc: ApiError) -> JSONResponse:
    return error_json(exc)


@app.exception_handler(comfy.ComfyError)
async def comfy_error(_request: Any, exc: comfy.ComfyError) -> JSONResponse:
    return error_json(exc)


@app.exception_handler(templates.TemplateError)
async def template_error(_request: Any, exc: templates.TemplateError) -> JSONResponse:
    return error_json(exc)


for router_module in (generate, model_routes, wildcards, gallery, civitai, complete, core):
    app.include_router(router_module.api, prefix="/api")
