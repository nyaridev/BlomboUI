from __future__ import annotations

import json
import re
import time
from typing import Any

from infrastructure.storage.repositories import download_history as repo

_HTML = re.compile(r"<[^>]+>")
_DESC_MAX = 8000


def list_items() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in repo.list_rows():
        row = _row(item)
        if row.get("status") == "downloading":
            continue
        row.pop("request", None)
        out.append(row)
    return out


def get(ident: int) -> dict[str, Any] | None:
    row = repo.get_by_id(ident)
    return _row(row) if row else None


def record(
    *,
    source: str,
    model_id: int,
    version_id: int,
    file_id: int | None,
    name: str,
    version_name: str,
    kind: str,
    creator: str,
    file_name: str,
    size_bytes: int,
    paths: list[str],
    image_url: str,
    site: str,
    base_model: str = "",
    tags: list[str] | None = None,
    trained_words: list[str] | None = None,
    description: str = "",
    search_text: str = "",
    model_type: str = "",
    status: str = "done",
    error: str = "",
    request: dict[str, Any] | None = None,
    history_id: int | None = None,
) -> int:
    tag_list = _str_list(tags)
    words = _str_list(trained_words)
    desc = plain(description)
    blob = search_text.strip() or search_blob(
        name,
        creator,
        file_name,
        version_name,
        kind,
        model_type,
        base_model,
        *tag_list,
        *words,
        desc,
        *paths,
    )
    payload = {
        "source": source,
        "model_id": model_id,
        "version_id": version_id,
        "file_id": file_id,
        "name": name,
        "version_name": version_name,
        "kind": kind,
        "creator": creator,
        "file_name": file_name,
        "size_bytes": size_bytes,
        "base_model": base_model,
        "tags": tag_list,
        "trained_words": words,
        "description": desc,
        "search_text": blob,
        "paths": paths,
        "image_url": image_url,
        "site": site,
        "status": "failed" if status == "failed" else "downloading" if status == "downloading" else "done",
        "error": error if status == "failed" else "",
        "request": request if isinstance(request, dict) else {},
        "created_at": int(time.time()),
    }
    if history_id:
        repo.update(history_id, payload)
        ident = history_id
    else:
        ident = repo.insert(payload)
    if payload["status"] != "downloading":
        trim_to_limit()
    return ident


def record_failed(
    *,
    body: dict[str, Any],
    error: str,
    history_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> int:
    extra = extra or {}
    try:
        model_id = int(body.get("modelId") or extra.get("modelId") or 0)
        version_id = int(body.get("versionId") or extra.get("versionId") or 0)
    except (TypeError, ValueError):
        model_id, version_id = 0, 0
    file_id = body.get("fileId")
    if file_id is None:
        file_id = extra.get("fileId")
    try:
        file_id = int(file_id) if file_id is not None else None
    except (TypeError, ValueError):
        file_id = None
    return record(
        source="civitai",
        model_id=model_id,
        version_id=version_id,
        file_id=file_id,
        name=str(extra.get("name") or body.get("modelName") or ""),
        version_name=str(extra.get("versionName") or extra.get("version_name") or ""),
        kind=str(extra.get("kind") or ""),
        creator=str(extra.get("creator") or ""),
        file_name=str(extra.get("fileName") or extra.get("file_name") or ""),
        size_bytes=_int(extra.get("sizeBytes") or extra.get("size_bytes")),
        paths=[],
        image_url=str(extra.get("imageUrl") or extra.get("image_url") or ""),
        site=str(extra.get("site") or ""),
        base_model=str(extra.get("baseModel") or extra.get("base_model") or ""),
        tags=list(extra.get("tags") or []) if isinstance(extra.get("tags"), list) else [],
        trained_words=list(extra.get("trainedWords") or extra.get("trained_words") or [])
        if isinstance(extra.get("trainedWords") or extra.get("trained_words"), list)
        else [],
        description=str(extra.get("description") or ""),
        search_text=str(extra.get("searchText") or extra.get("search_text") or ""),
        status="failed",
        error=str(error or ""),
        request=_request_body(body),
        history_id=history_id,
    )


def bump_retry(ident: int) -> bool:
    return repo.bump_retry(ident, int(time.time()))


def delete(ident: int) -> bool:
    return repo.delete(ident)


def clear() -> int:
    return repo.delete_all()


def trim_to_limit() -> list[int]:
    from features.downloads.scripts.thumbs import delete_thumbs
    from features.settings import service as settings

    try:
        limit = int(settings.load().get("downloadHistoryLimit", -1))
    except (TypeError, ValueError):
        limit = -1
    if limit < -1:
        limit = -1
    dropped = repo.ids_beyond(limit)
    for ident in dropped:
        repo.delete(ident)
        delete_thumbs(ident)
    return dropped


def plain(raw: object, limit: int = _DESC_MAX) -> str:
    text = _HTML.sub(" ", str(raw or ""))
    return " ".join(text.split())[:limit]


def search_blob(*parts: object) -> str:
    seen: list[str] = []
    used: set[str] = set()
    for part in parts:
        text = " ".join(str(part or "").split()).casefold()
        if not text or text in used:
            continue
        used.add(text)
        seen.append(text)
    return " ".join(seen)


def _str_list(raw: object) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item).strip()]


def _json_list(raw: object) -> list[str]:
    if isinstance(raw, list):
        return _str_list(raw)
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else []
    except (TypeError, json.JSONDecodeError):
        return []
    return _str_list(parsed)


def _col(row: Any, keys: set[str], name: str, default: str = "") -> str:
    if name not in keys:
        return default
    return str(row[name] or default)


def _row(row: Any) -> dict[str, Any]:
    try:
        paths = json.loads(row["paths_json"])
    except (TypeError, json.JSONDecodeError):
        paths = []
    file_id = row["file_id"]
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    file_name = _col(row, keys, "file_name")
    try:
        size_bytes = int(row["size_bytes"] or 0) if "size_bytes" in keys else 0
    except (TypeError, ValueError):
        size_bytes = 0
    tags = _json_list(row["tags_json"] if "tags_json" in keys else "[]")
    words = _json_list(row["trained_words_json"] if "trained_words_json" in keys else "[]")
    description = _col(row, keys, "description")
    search_text = _col(row, keys, "search_text")
    if not search_text:
        search_text = search_blob(
            row["name"],
            row["creator"],
            file_name,
            row["version_name"],
            row["kind"],
            _col(row, keys, "base_model"),
            *tags,
            *words,
            description,
            *(paths if isinstance(paths, list) else []),
        )
    request = _request_json(row, keys)
    return {
        "id": int(row["id"]),
        "source": str(row["source"] or ""),
        "modelId": int(row["model_id"]),
        "versionId": int(row["version_id"]),
        "fileId": None if file_id is None else int(file_id),
        "name": str(row["name"] or ""),
        "versionName": str(row["version_name"] or ""),
        "kind": str(row["kind"] or ""),
        "creator": str(row["creator"] or ""),
        "fileName": file_name,
        "sizeBytes": max(0, size_bytes),
        "baseModel": _col(row, keys, "base_model"),
        "tags": tags,
        "trainedWords": words,
        "description": description,
        "searchText": search_text,
        "paths": paths if isinstance(paths, list) else [],
        "imageUrl": str(row["image_url"] or ""),
        "site": str(row["site"] or ""),
        "status": "failed"
        if _col(row, keys, "status", "done") == "failed"
        else "downloading"
        if _col(row, keys, "status", "done") == "downloading"
        else "done",
        "error": _col(row, keys, "error"),
        "request": request,
        "createdAt": int(row["created_at"] or 0),
    }


def _request_json(row: Any, keys: set[str]) -> dict[str, Any]:
    if "request_json" not in keys:
        return {}
    try:
        parsed = json.loads(row["request_json"])
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _request_body(body: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("modelId", "versionId", "fileId", "customNaming", "modelName", "creatorAlias"):
        if key in body:
            out[key] = body[key]
    return out


def _int(raw: object) -> int:
    try:
        return max(0, int(raw or 0))
    except (TypeError, ValueError):
        return 0
