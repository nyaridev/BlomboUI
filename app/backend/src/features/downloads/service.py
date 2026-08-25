from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from features.civitai.scripts import downloads as civitai_downloads
from features.downloads.scripts.history import bump_retry, clear as clear_history
from features.downloads.scripts.history import delete as delete_history
from features.downloads.scripts.history import get, list_items
from features.downloads.scripts.progress import list_active
from features.downloads.scripts import queue as download_queue
from features.downloads.scripts.thumbs import clear_thumbs, delete_thumbs, item_thumb, thumb_media
from features.models import service as models

__all__ = [
    "DownloadRevealError",
    "DownloadRetryError",
    "active",
    "clear",
    "list_items",
    "queued",
    "remove",
    "retry",
    "reveal",
    "submit_civitai",
    "thumb",
    "thumb_media",
]


class DownloadRevealError(RuntimeError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


class DownloadRetryError(RuntimeError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def thumb(ident: int) -> Path | None:
    return item_thumb(ident)


def active() -> list:
    return list_active()


def queued() -> list:
    return download_queue.list_queued()


def submit_civitai(body: dict[str, Any]) -> dict[str, Any]:
    if download_queue.queue_on():
        return {"queued": True, "key": download_queue.enqueue(body)}
    try:
        return civitai_downloads.download(body)
    except civitai_downloads.CivitaiDownloadError:
        raise


def retry(ident: int) -> dict[str, Any]:
    row = get(ident)
    if not row:
        raise DownloadRetryError("download not found", 404)
    if str(row.get("status") or "done") != "failed":
        raise DownloadRetryError("download is not failed", 400)
    body = row.get("request")
    if not isinstance(body, dict) or not body.get("modelId") or not body.get("versionId"):
        raise DownloadRetryError("download cannot be retried", 400)
    bump_retry(ident)
    preview = {
        "name": row.get("name"),
        "versionName": row.get("versionName"),
        "kind": row.get("kind"),
        "creator": row.get("creator"),
        "fileName": row.get("fileName"),
        "sizeBytes": row.get("sizeBytes"),
        "imageUrl": row.get("imageUrl"),
        "site": row.get("site"),
        "modelId": row.get("modelId"),
        "versionId": row.get("versionId"),
        "fileId": row.get("fileId"),
        "baseModel": row.get("baseModel"),
        "tags": row.get("tags"),
        "trainedWords": row.get("trainedWords"),
        "description": row.get("description"),
        "searchText": row.get("searchText"),
    }
    if download_queue.queue_on():
        return {"queued": True, "key": download_queue.enqueue(body, history_id=ident, preview=preview)}
    try:
        result = civitai_downloads.download(body, history_id=ident)
    except civitai_downloads.CivitaiDownloadError:
        raise
    try:
        models.refresh_models(result["kind"])
    except Exception:
        pass
    return result


def remove(ident: int) -> bool:
    if not ident:
        return False
    if not delete_history(ident):
        return False
    delete_thumbs(ident)
    return True


def clear() -> int:
    count = clear_history()
    clear_thumbs()
    return count


def reveal(ident: int) -> None:
    row = get(ident)
    if not row:
        raise DownloadRevealError("download not found", 404)
    target: Path | None = None
    for raw in row.get("paths") or []:
        path = Path(str(raw))
        if path.exists():
            target = path
            break
    if target is None:
        raise DownloadRevealError("file not found", 404)
    if sys.platform != "win32":
        raise DownloadRevealError("open folder is only supported on Windows")
    resolved = str(target.resolve())
    if target.is_file():
        subprocess.Popen(["explorer", "/select,", resolved])
        return
    os.startfile(resolved)
