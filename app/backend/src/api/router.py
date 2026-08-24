from __future__ import annotations

from fastapi import FastAPI

from api.routes import civitai, complete, gallery, generate, models, settings, system, wildcards


def include_routes(app: FastAPI) -> None:
    for router_module in (generate, models, wildcards, gallery, civitai, complete, settings, system):
        app.include_router(router_module.api, prefix="/api")
