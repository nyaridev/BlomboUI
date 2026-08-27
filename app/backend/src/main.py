from __future__ import annotations

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

if os.environ.get("BLOMBO_API_PINGS") != "1":
    logging.getLogger("uvicorn.access").disabled = True

from api.errors import ApiError, error_json
from api.router import include_routes
from features.complete import service as complete
from features.gallery import service as gallery
from features.generate import service as generate
from features.models import service as models
from infrastructure.storage import connect as connect_storage


@asynccontextmanager
async def lifespan(_app: FastAPI):
    connect_storage()
    models.list_scopes()
    complete.schedule_rebuild()
    models.start()
    threading.Thread(target=_warm_hashes, daemon=True, name="hash-warm").start()
    try:
        await asyncio.to_thread(gallery.purge_expired)
    except OSError:
        pass
    yield
    models.stop()


def _warm_hashes() -> None:
    models.warm(models.hash_files())


app = FastAPI(title="BlomboUI", lifespan=lifespan)


@app.exception_handler(ApiError)
async def api_error(_request: Any, exc: ApiError) -> JSONResponse:
    return error_json(exc)


@app.exception_handler(generate.ComfyError)
async def comfy_error(_request: Any, exc: generate.ComfyError) -> JSONResponse:
    return error_json(exc)


@app.exception_handler(generate.TemplateError)
async def template_error(_request: Any, exc: generate.TemplateError) -> JSONResponse:
    return error_json(exc)


include_routes(app)
