from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from features.generate.scripts import save_meta
from features.models.scripts import hashes
from infrastructure.storage.repositories import gallery as gallery_repo

_KINDS = ("loras", "checkpoints", "diffusion_models")
_DELAY = 0.5
_lock = threading.Lock()
_pending: list[tuple[dict[str, str], Path, list[Path]]] = []
_timer: threading.Timer | None = None


def install() -> None:
    hashes.listen(schedule)


def schedule(fields: dict[str, str], path: Path, old_paths: list[Path] | None = None) -> None:
    global _timer
    with _lock:
        _pending.append((fields, path, list(old_paths or [])))
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(_DELAY, _flush)
        _timer.daemon = True
        _timer.start()


def apply(fields: dict[str, str], path: Path, old_paths: list[Path] | None = None) -> None:
    kind = _kind_of(path)
    if not kind:
        return
    name = save_meta.rel_for_hashes(kind, fields)
    if not name or save_meta.is_digest(name):
        return
    aliases = _digests(fields)
    for old in old_paths or []:
        rel = save_meta.rel_under_kind(kind, old)
        if rel and rel != name:
            aliases.add(rel)
    _rename(aliases, name, kind)


def relink_digests() -> None:
    for row in gallery_repo.query("SELECT DISTINCT checkpoint_name AS name FROM gallery_items WHERE checkpoint_name != ''"):
        raw = str(row["name"] or "")
        if not save_meta.is_digest(raw):
            continue
        blob = {"autov2": raw, "sha256": raw}
        resolved = save_meta.rel_for_hashes("checkpoints", blob)
        kind = "checkpoints"
        if not resolved or save_meta.is_digest(resolved):
            resolved = save_meta.rel_for_hashes("diffusion_models", blob)
            kind = "diffusion_models"
        if resolved and not save_meta.is_digest(resolved):
            _rename({raw}, resolved, kind)
    for row in gallery_repo.query("SELECT DISTINCT name FROM gallery_item_loras"):
        raw = str(row["name"] or "")
        if not save_meta.is_digest(raw):
            continue
        resolved = save_meta.rel_for_hashes("loras", {"autov2": raw, "sha256": raw})
        if resolved and not save_meta.is_digest(resolved):
            _rename({raw}, resolved, "loras")


def _flush() -> None:
    with _lock:
        batch = list(_pending)
        _pending.clear()
    for fields, path, old_paths in batch:
        apply(fields, path, old_paths)


def _kind_of(path: Path) -> str:
    parts = {part.casefold() for part in path.parts}
    for kind in _KINDS:
        if kind in parts:
            return kind
    return ""


def _digests(fields: dict[str, str]) -> set[str]:
    return {str(fields.get(key) or "") for key in save_meta.HASH_KEYS if fields.get(key)}


def _rename(aliases: set[str], name: str, kind: str) -> None:
    wanted = [item for item in aliases if item and item != name]
    if not wanted:
        return

    def write(conn: Any) -> None:
        if kind in {"checkpoints", "diffusion_models"}:
            gallery_repo.rename_checkpoint(conn, wanted, name)
        if kind == "loras":
            gallery_repo.rename_loras(conn, wanted, name)

    gallery_repo.transaction(write)
