from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from typing import Any

_LOCK = threading.Lock()
_QUEUE: deque[dict[str, Any]] = deque()
_RUNNING = 0


def queue_on() -> bool:
    from features.settings import service as settings

    return settings.load().get("downloadQueue", True) is not False


def parallel() -> int:
    from features.settings import service as settings

    try:
        value = int(settings.load().get("downloadQueueParallel") or 10)
    except (TypeError, ValueError):
        value = 10
    return max(1, min(20, value))


def enqueue(
    body: dict[str, Any],
    *,
    history_id: int | None = None,
    preview: dict[str, Any] | None = None,
) -> str:
    preview = preview or {}
    key = uuid.uuid4().hex
    file_id = body.get("fileId")
    if file_id is None:
        file_id = preview.get("fileId")
    job = {
        "key": key,
        "body": dict(body),
        "historyId": history_id,
        "queuedAt": time.time(),
        "name": str(preview.get("name") or body.get("modelName") or ""),
        "versionName": str(preview.get("versionName") or ""),
        "kind": str(preview.get("kind") or ""),
        "creator": str(preview.get("creator") or ""),
        "fileName": str(preview.get("fileName") or ""),
        "sizeBytes": _int(preview.get("sizeBytes")),
        "imageUrl": str(preview.get("imageUrl") or ""),
        "site": str(preview.get("site") or ""),
        "modelId": _int(body.get("modelId") or preview.get("modelId")),
        "versionId": _int(body.get("versionId") or preview.get("versionId")),
        "fileId": None if file_id is None else _int(file_id),
        "baseModel": str(preview.get("baseModel") or ""),
        "tags": _str_list(preview.get("tags")),
        "trainedWords": _str_list(preview.get("trainedWords")),
        "description": str(preview.get("description") or ""),
        "searchText": str(preview.get("searchText") or ""),
    }
    if history_id:
        from features.downloads.scripts import thumbs as download_thumbs

        download_thumbs.prefetch(int(history_id))
    with _LOCK:
        _QUEUE.append(job)
    kick()
    return key


def list_queued() -> list[dict[str, Any]]:
    with _LOCK:
        rows = [{k: v for k, v in job.items() if k != "body"} for job in _QUEUE]
    rows.sort(key=lambda row: float(row.get("queuedAt") or 0), reverse=True)
    return rows


def kick() -> None:
    global _RUNNING
    cap = parallel()
    while True:
        with _LOCK:
            if _RUNNING >= cap or not _QUEUE:
                return
            job = _QUEUE.popleft()
            _RUNNING += 1
        threading.Thread(target=_run, args=(job,), daemon=True).start()


def _run(job: dict[str, Any]) -> None:
    global _RUNNING
    try:
        from features.civitai.scripts import downloads as civitai_downloads
        from features.models import service as models

        try:
            result = civitai_downloads.download(job["body"], history_id=job.get("historyId"))
        except civitai_downloads.CivitaiDownloadError as exc:
            _fail(job, str(exc))
            return
        except Exception as exc:
            _fail(job, str(exc))
            return
        try:
            models.refresh_models(result["kind"])
        except Exception:
            pass
    finally:
        with _LOCK:
            _RUNNING -= 1
        kick()


def _fail(job: dict[str, Any], message: str) -> None:
    from features.issues.service import record_log

    body = job.get("body") if isinstance(job.get("body"), dict) else {}
    name = str(job.get("name") or body.get("modelName") or f"model {body.get('modelId')}")
    record_log(
        "civitai",
        "download_failed",
        name,
        message,
        [f"model {body.get('modelId')}", f"version {body.get('versionId')}"],
    )


def _int(raw: object) -> int:
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def _str_list(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item).strip()]
