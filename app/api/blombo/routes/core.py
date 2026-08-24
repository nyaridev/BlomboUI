from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from blombo import dirs, issues, settings
from blombo.complete import autocomplete, tag_complete
from blombo.generate import comfy
from blombo.paths import RUNTIME, VERSION, launcher_env
from .common import ApiError, AutocompleteCsvIn, ComfyFreeIn, OutputPathIn, PathsCheckIn

api = APIRouter()

@api.get("/issues")
def get_issues() -> dict:
    return {"issues": issues.list_issues()}

@api.get("/health")
def health() -> dict:
    env = launcher_env()
    return {
        "ok": True,
        "api": "blombo",
        "version": VERSION,
        "comfy": {
            "reachable": comfy.reachable(),
            "restarting": (RUNTIME / "tmp" / "comfy-restart").is_file(),
            "mode": env.get("comfyui.mode"),
            "path": env.get("comfyui.path"),
            "url": comfy.comfy_base(),
        },
    }


@api.get("/comfy/stats")
def comfy_stats() -> dict:
    return comfy.gpu_stats()


@api.post("/comfy/free")
def comfy_free(body: ComfyFreeIn) -> dict:
    comfy.free(body.unload_models, body.free_memory)
    return {"ok": True}

@api.get("/user-settings")
def get_settings() -> dict:
    return {"settings": settings.load()}


@api.put("/user-settings")
def put_settings(body: dict[str, Any]) -> dict:
    data = settings.save(body)
    dirs.write_extra_model_paths()
    return {"settings": data}


@api.post("/pick-folder")
def pick_folder() -> dict:
    try:
        return {"path": dirs.pick_folder()}
    except RuntimeError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.get("/paths")
def get_paths() -> dict:
    return dirs.resolved()


@api.post("/paths/check")
def check_paths(body: PathsCheckIn) -> dict:
    exists: dict[str, bool] = {}
    for raw in body.paths[:80]:
        text = str(raw or "").strip()
        if not text:
            continue
        exists[text] = dirs.dir_exists(text)
    return {"exists": exists}


@api.post("/paths/open")
def open_path(body: OutputPathIn) -> dict:
    try:
        dirs.open_folder(body.path)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"ok": True}


@api.put("/paths/output")
def put_output_path(body: OutputPathIn) -> dict:
    try:
        return dirs.set_output_root(body.path)
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc


@api.post("/paths/models/sync")
def sync_model_paths() -> dict:
    dirs.write_extra_model_paths()
    return {"ok": True}


@api.post("/paths/models/reload")
def reload_model_paths() -> dict:
    dirs.write_extra_model_paths()
    flag = RUNTIME / "tmp" / "comfy-restart"
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.touch()
    return {"ok": True}


@api.post("/reload")
def reload_app() -> dict:
    flag = RUNTIME / "tmp" / "restart"
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text("1", encoding="utf-8")
    return {"ok": True}
