from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from api.errors import ApiError
from api.http import file_response
from features.downloads import service as downloads
from features.downloads.service import DownloadRevealError, DownloadRetryError
from features.civitai.scripts.downloads import CivitaiDownloadError
from features.issues.service import record_log

api = APIRouter()


@api.get("/downloads")
def get_downloads() -> dict:
    return {"items": downloads.list_items(), "active": downloads.active(), "queued": downloads.queued()}


@api.get("/downloads/{ident}/thumb")
def get_download_thumb(ident: int) -> FileResponse:
    path = downloads.thumb(ident)
    if not path:
        raise ApiError("not_found", "image not found")
    return file_response(path, downloads.thumb_media(path))


@api.post("/downloads/{ident}/retry")
def retry_download(ident: int) -> dict:
    try:
        result = downloads.retry(ident)
    except DownloadRetryError as exc:
        code = "not_found" if exc.status == 404 else "bad_request"
        raise ApiError(code, str(exc), exc.status) from exc
    except CivitaiDownloadError as exc:
        record_log("civitai", "download_failed", f"download {ident}", str(exc), [f"download {ident}"])
        raise ApiError("civitai_download_error", str(exc), 400) from exc
    return result


@api.post("/downloads/{ident}/open")
def open_download(ident: int) -> dict:
    try:
        downloads.reveal(ident)
    except DownloadRevealError as exc:
        code = "not_found" if exc.status == 404 else "bad_request"
        raise ApiError(code, str(exc), exc.status) from exc
    return {"ok": True}


@api.delete("/downloads/{ident}")
def delete_download(ident: int) -> dict:
    if not downloads.remove(ident):
        raise ApiError("not_found", "download not found")
    return {"ok": True}


@api.delete("/downloads")
def delete_downloads() -> dict:
    return {"ok": True, "count": downloads.clear()}
