from __future__ import annotations

from fastapi import APIRouter

from api.errors import ApiError
from features.generate.schemas import ComfyFreeIn
from features.generate import service as generate
from features.issues.service import clear_log, dismiss_log, list_issues
from features.settings import service as settings
from features.settings.schemas import OutputPathIn, PathsCheckIn
from shared import dirs
from config import RUNTIME, VERSION, launcher_env

api = APIRouter()


@api.get("/issues")
def get_issues() -> dict:
    return {"issues": list_issues()}


@api.delete("/issues")
def delete_issue_log() -> dict:
    return {"ok": True, "count": clear_log()}


@api.delete("/issues/{ident}")
def delete_issue(ident: int) -> dict:
    if not dismiss_log(ident):
        raise ApiError("not_found", "issue not found")
    return {"ok": True}


@api.get("/health")
def health() -> dict:
    env = launcher_env()
    return {
        "ok": True,
        "api": "blombo",
        "version": VERSION,
        "comfy": {
            "reachable": generate.reachable(),
            "restarting": (RUNTIME / "tmp" / "comfy-restart").is_file(),
            "mode": env.get("comfyui.mode"),
            "path": env.get("comfyui.path"),
            "url": generate.comfy_base(),
        },
    }


@api.get("/comfy/stats")
def comfy_stats() -> dict:
    return generate.gpu_stats()


@api.post("/comfy/free")
def comfy_free(body: ComfyFreeIn) -> dict:
    generate.free(body.unload_models, body.free_memory)
    return {"ok": True}


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
