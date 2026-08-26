from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from features.downloads.scripts.thumbs import BROWSE_THUMBS, clear_thumbs, delete_thumbs, item_thumb, prefetch, thumb_media
from infrastructure.storage.repositories import browse_history as repo


def list_items() -> list[dict[str, Any]]:
    return [_row(item) for item in repo.list_rows()]


def get(ident: int) -> dict[str, Any] | None:
    row = repo.get_by_id(ident)
    return _row(row) if row else None


def record(body: dict[str, Any]) -> dict[str, Any]:
    try:
        model_id = int(body.get("modelId") or 0)
    except (TypeError, ValueError):
        model_id = 0
    if model_id <= 0:
        raise ValueError("modelId required")
    name = str(body.get("name") or "").strip()[:200]
    kind = str(body.get("type") or body.get("kind") or "").strip()[:80]
    creator = str(body.get("creator") or "").strip()[:200]
    image_url = str(body.get("imageUrl") or "").strip()
    site = str(body.get("site") or "").strip()[:40]
    search = " ".join(part for part in (name, creator, kind) if part).casefold()
    ident = repo.upsert(
        {
            "model_id": model_id,
            "name": name or f"Model {model_id}",
            "type": kind,
            "creator": creator,
            "image_url": image_url,
            "site": site,
            "search_text": search,
            "viewed_at": int(time.time()),
        }
    )
    trim_to_limit()
    if image_url and repo.get_by_id(ident):
        prefetch(ident, root=BROWSE_THUMBS, image_url=image_url)
    row = get(ident)
    return row or {"id": ident, "modelId": model_id}


def remove(ident: int) -> bool:
    if not ident or not repo.delete(ident):
        return False
    delete_thumbs(ident, BROWSE_THUMBS)
    return True


def clear() -> int:
    count = repo.delete_all()
    clear_thumbs(BROWSE_THUMBS)
    return count


def thumb(ident: int) -> Path | None:
    row = get(ident)
    if not row:
        return None
    return item_thumb(ident, root=BROWSE_THUMBS, image_url=str(row.get("imageUrl") or ""))


def trim_to_limit() -> list[int]:
    from features.settings import service as settings

    try:
        limit = int(settings.load().get("browseHistoryLimit", 500))
    except (TypeError, ValueError):
        limit = 500
    if limit < -1:
        limit = 500
    dropped = repo.ids_beyond(limit)
    for ident in dropped:
        repo.delete(ident)
        delete_thumbs(ident, BROWSE_THUMBS)
    return dropped


def _row(row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "modelId": int(row["model_id"]),
        "name": str(row["name"] or ""),
        "type": str(row["type"] or ""),
        "creator": str(row["creator"] or ""),
        "imageUrl": str(row["image_url"] or ""),
        "site": str(row["site"] or ""),
        "searchText": str(row["search_text"] or ""),
        "viewedAt": int(row["viewed_at"] or 0),
    }
