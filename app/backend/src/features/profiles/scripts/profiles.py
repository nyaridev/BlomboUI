from __future__ import annotations

import shutil
import time
import uuid
from typing import Any

import config
from config import (
    DEFAULT_PROFILE_ID,
    DEFAULT_PROFILE_NAME,
    ensure_profile_dirs,
    valid_profile_id,
)
from infrastructure.storage.repositories import profiles as repo

RETAIN_SECONDS = 72 * 3600


class ProfileError(ValueError):
    def __init__(self, message: str, status: int = 400, code: str = "bad_request") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def list_profiles() -> dict[str, Any]:
    purge_expired()
    active = repo.active_id()
    profiles = [_public(row, active) for row in repo.list_rows()]
    removed = [_public_removed(row) for row in repo.list_removed()]
    return {"activeId": active, "profiles": profiles, "removed": removed}


def current() -> dict[str, Any]:
    active = repo.active_id()
    row = repo.get(active)
    if row is None:
        return {"id": DEFAULT_PROFILE_ID, "displayName": DEFAULT_PROFILE_NAME}
    return {"id": row["id"], "displayName": row["display_name"]}


def create(display_name: str) -> dict[str, Any]:
    name = _clean_name(display_name)
    if repo.display_name_taken(name):
        raise ProfileError("a profile with that name already exists")
    ident = str(uuid.uuid4())
    repo.insert(ident, name, int(time.time()))
    ensure_profile_dirs(ident)
    return _public({"id": ident, "display_name": name, "created_at": 0}, repo.active_id())


def rename(ident: str, display_name: str) -> dict[str, Any]:
    ident = _existing_id(ident)
    if ident == DEFAULT_PROFILE_ID:
        raise ProfileError("cannot rename the default profile")
    name = _clean_name(display_name)
    if repo.display_name_taken(name, skip_id=ident):
        raise ProfileError("a profile with that name already exists")
    repo.set_display_name(ident, name)
    row = repo.get(ident)
    if row is None:
        raise ProfileError("profile not found", 404, "not_found")
    return _public(row, repo.active_id())


def delete(ident: str) -> None:
    ident = _existing_id(ident)
    if ident == DEFAULT_PROFILE_ID:
        raise ProfileError("cannot delete the default profile")
    if ident == repo.active_id():
        raise ProfileError("cannot delete the active profile")
    if repo.move_to_removed(ident, int(time.time())) is None:
        raise ProfileError("profile not found", 404, "not_found")


def restore(ident: str) -> dict[str, Any]:
    ident = _removed_id(ident)
    row = repo.get_removed(ident)
    if row is None:
        raise ProfileError("profile not found", 404, "not_found")
    if repo.display_name_taken(str(row["display_name"])):
        raise ProfileError("a profile with that name already exists")
    restored = repo.restore_from_removed(ident)
    if restored is None:
        raise ProfileError("profile not found", 404, "not_found")
    ensure_profile_dirs(ident)
    return _public(restored, repo.active_id())


def purge(ident: str) -> None:
    ident = _removed_id(ident)
    repo.delete_removed(ident)
    _purge_dirs(ident)


def purge_expired() -> None:
    cutoff = int(time.time()) - RETAIN_SECONDS
    for row in repo.list_removed():
        if int(row["removed_at"]) <= cutoff:
            ident = str(row["id"])
            repo.delete_removed(ident)
            _purge_dirs(ident)


def activate(ident: str) -> dict[str, Any]:
    ident = _existing_id(ident)
    repo.set_active(ident)
    return list_profiles()


def _existing_id(ident: str) -> str:
    text = str(ident or "").strip().lower()
    if not valid_profile_id(text) or repo.get(text) is None:
        raise ProfileError("profile not found", 404, "not_found")
    return text


def _removed_id(ident: str) -> str:
    text = str(ident or "").strip().lower()
    if not valid_profile_id(text) or repo.get_removed(text) is None:
        raise ProfileError("profile not found", 404, "not_found")
    return text


def _clean_name(raw: str) -> str:
    name = " ".join(str(raw or "").split())
    if not name:
        raise ProfileError("display name is required")
    if len(name) > 40:
        raise ProfileError("display name is too long")
    return name


def _public(row: dict[str, Any], active: str) -> dict[str, Any]:
    ident = str(row["id"])
    return {
        "id": ident,
        "displayName": str(row["display_name"]),
        "locked": ident == DEFAULT_PROFILE_ID,
        "active": ident == active,
    }


def _public_removed(row: dict[str, Any]) -> dict[str, Any]:
    removed_at = int(row["removed_at"])
    return {
        "id": str(row["id"]),
        "displayName": str(row["display_name"]),
        "removedAt": removed_at,
        "expiresAt": removed_at + RETAIN_SECONDS,
    }


def _purge_dirs(ident: str) -> None:
    if not valid_profile_id(ident) or ident == DEFAULT_PROFILE_ID:
        return
    folders = [
        config.DATA / "sqlite" / ident,
        config.RUNTIME / "data" / "sqlite" / ident,
        config.USER / "gallery_thumbs" / ident,
        config.USER / "model_thumbs" / ident,
        config.DATA / "history" / ident,
        config.USER / "removed" / ident,
        config.USER / "output" / ident,
    ]
    for folder in folders:
        shutil.rmtree(folder, ignore_errors=True)
