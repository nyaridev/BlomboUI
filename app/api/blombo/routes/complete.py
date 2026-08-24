from __future__ import annotations

from fastapi import APIRouter

from blombo import dirs
from blombo.complete import autocomplete, tag_complete
from .common import ApiError, AutocompleteCsvIn

api = APIRouter()

@api.get("/autocomplete/csv")
def list_autocomplete_csv() -> dict:
    return {"files": autocomplete.list_csv()}


@api.post("/autocomplete/csv")
def download_autocomplete_csv(body: AutocompleteCsvIn) -> dict:
    try:
        out = autocomplete.download_csv(body.name)
    except ValueError as exc:
        text = str(exc)
        status = 400 if text.startswith("invalid") else 502
        raise ApiError("bad_request" if status == 400 else "download_failed", text, status) from exc
    tag_complete.schedule_rebuild()
    return out


@api.get("/autocomplete/suggest")
def autocomplete_suggest(q: str = "", checkpoint: str = "") -> dict:
    return {"tags": tag_complete.suggest(q, checkpoint), "ready": tag_complete.ready()}


@api.get("/autocomplete/frequent")
def autocomplete_frequent() -> dict:
    return tag_complete.frequent()


@api.get("/autocomplete/usage")
def autocomplete_usage(prefix: str = "") -> dict:
    return tag_complete.prefix_usage(prefix)


@api.post("/autocomplete/open")
def open_autocomplete() -> dict:
    try:
        dirs.open_folder(str(autocomplete.csv_root()))
    except ValueError as exc:
        raise ApiError("bad_request", str(exc), 400) from exc
    return {"ok": True}
