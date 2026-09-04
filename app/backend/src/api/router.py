from __future__ import annotations

from fastapi import FastAPI

from api.routes import civitai, complete, downloads, gallery, generate, history, manager, models, profiles, settings, system, wildcards


def include_routes(app: FastAPI) -> None:
    for router_module in (
        generate,
        models,
        manager,
        wildcards,
        gallery,
        civitai,
        downloads,
        history,
        complete,
        settings,
        profiles,
        system,
    ):
        app.include_router(router_module.api, prefix="/api")
