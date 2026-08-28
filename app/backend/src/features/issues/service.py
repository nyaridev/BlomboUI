from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from features.models.scripts import models
from features.models.scripts import thumbnail_scopes
from features.wildcards.scripts import wildcards as wildcard_meta
from infrastructure.storage.repositories import error_log as error_log_repo


def list_issues() -> list[dict[str, Any]]:
    scanned = [
        *_duplicate_names("loras"),
        *_wildcard_duplicate_names(),
        *_wildcard_invalid(),
        *_duplicate_headers(),
        *_directory_issues(),
        *_duplicate_scope_names(),
    ]
    scanned.sort(key=lambda row: (str(row["kind"]), str(row["code"]), str(row["name"])))
    return [*_logged_issues(), *scanned]


def _issue(code: str, kind: str, name: str, message: str, paths: list[str]) -> dict[str, Any]:
    return {"code": code, "kind": kind, "name": name, "message": message, "paths": paths}


def record_log(kind: str, code: str, name: str, message: str, paths: list[str] | None = None) -> None:
    try:
        error_log_repo.insert(
            {
                "kind": kind,
                "code": code,
                "name": name,
                "message": message,
                "paths": paths or [],
                "created_at": int(time.time()),
            }
        )
    except Exception:
        pass


def dismiss_log(ident: int) -> bool:
    return error_log_repo.delete(ident)


def clear_log() -> int:
    return error_log_repo.delete_all()


def _logged_issues() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in error_log_repo.list_rows():
        try:
            paths = json.loads(row["paths_json"])
        except (TypeError, json.JSONDecodeError):
            paths = []
        item = _issue(
            str(row["code"] or ""),
            str(row["kind"] or ""),
            str(row["name"] or ""),
            str(row["message"] or ""),
            paths if isinstance(paths, list) else [],
        )
        item["id"] = int(row["id"])
        out.append(item)
    return out


def _duplicate_names(kind: str) -> list[dict[str, Any]]:
    groups: dict[str, list[str]] = {}
    for item in models.list_kind(kind):
        path = str(item.get("path") or "")
        stem = Path(path).stem.lower()
        if stem:
            groups.setdefault(stem, []).append(path)
    out: list[dict[str, Any]] = []
    for stem, paths in groups.items():
        if len(paths) < 2:
            continue
        out.append(
            _issue(
                "duplicate_name",
                kind,
                stem,
                f"Prompt tags like <lora:{stem}> pick the first match.",
                paths,
            )
        )
    return out


def _duplicate_scope_names() -> list[dict[str, Any]]:
    groups: dict[str, list[str]] = {}
    labels: dict[str, str] = {}
    for item in thumbnail_scopes.list_scopes():
        ident = str(item.get("id") or "")
        name = str(item.get("name") or "").strip()
        key = name.lower()
        if not ident or not key:
            continue
        groups.setdefault(key, []).append(ident)
        labels.setdefault(key, name)
    out: list[dict[str, Any]] = []
    for key, ids in groups.items():
        if len(ids) < 2:
            continue
        name = labels[key]
        out.append(
            _issue(
                "duplicate_name",
                "scopes",
                name,
                f"Scope name '{name}' is used more than once.",
                ids,
            )
        )
    return out


def _wildcard_duplicate_names() -> list[dict[str, Any]]:
    from features.wildcards.scripts.files import _leaf_stem, tree

    groups: dict[tuple[str, str], list[str]] = {}

    def walk(nodes: list[dict[str, Any]], parent: str) -> None:
        for node in nodes:
            stem = _leaf_stem(str(node.get("name") or ""))
            rel = str(node.get("path") or "")
            if stem and rel:
                groups.setdefault((parent, stem), []).append(rel)
            if node.get("kind") == "dir":
                walk(node.get("children") or [], rel)

    for root in tree().get("roots") or []:
        walk(root.get("children") or [], str(root.get("path") or ""))

    out: list[dict[str, Any]] = []
    for (parent, stem), paths in groups.items():
        if len(paths) < 2:
            continue
        where = parent or "Local"
        out.append(
            _issue(
                "duplicate_name",
                "wildcards",
                stem,
                f"Folder, .txt, and .yaml names must be unique. These share '{stem}' in {where}.",
                paths,
            )
        )
    return out


def _wildcard_invalid() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path, rel in wildcard_meta.iter_sources():
        err = wildcard_meta.file_error(path)
        if not err:
            continue
        out.append(_issue("invalid_file", "wildcards", rel, err, [rel]))
    return out


def _duplicate_headers() -> list[dict[str, Any]]:
    groups: dict[str, list[str]] = {}
    for path, rel in wildcard_meta.iter_sources():
        if path.suffix.lower() not in wildcard_meta.YAML_EXTS:
            continue
        for name in wildcard_meta.yaml_headers(path):
            groups.setdefault(name.lower(), []).append(rel)
    out: list[dict[str, Any]] = []
    for name, paths in groups.items():
        if len(paths) < 2:
            continue
        kept = paths[0]
        out.append(
            _issue(
                "duplicate_tag",
                "wildcards",
                name,
                f"YAML header '{name}' is used in more than one file. Only {kept} is shown.",
                paths,
            )
        )
    return out


def _directory_issues() -> list[dict[str, Any]]:
    from shared import dirs

    out: list[dict[str, Any]] = []
    groups = (
        ("models", "modelDirs"),
        ("wildcards", "wildcardDirs"),
        ("gallery", "galleryDirs"),
    )
    for kind, key in groups:
        seen_names: dict[str, str] = {}
        seen_paths: dict[str, str] = {}
        for item in dirs.listed_dirs(key):
            name = item["name"]
            ident = item["id"]
            path = item["path"]
            locked = ident in {dirs.LOCAL_ID, dirs.COMFY_ID, "output"}
            key_name = name.lower()
            name_dup = key_name in seen_names
            if name_dup:
                out.append(
                    _issue(
                        "duplicate_dir",
                        kind,
                        name,
                        f"Directory name '{name}' is already used. The first folder with this name is kept.",
                        [path] if path else [],
                    )
                )
            else:
                seen_names[key_name] = name
            folder = dirs.norm_dir(path)
            if folder and not locked and not name_dup:
                kept = seen_paths.get(folder)
                if kept:
                    out.append(
                        _issue(
                            "duplicate_dir",
                            kind,
                            name,
                            f"This folder is already added as '{kept}'.",
                            [path],
                        )
                    )
                else:
                    seen_paths[folder] = name
            elif folder:
                seen_paths.setdefault(folder, name)
            if locked:
                if path and not dirs.dir_exists(path):
                    out.append(_issue("missing_dir", kind, name, "Folder is missing or not a directory.", [path]))
                continue
            if not path or not dirs.dir_exists(path):
                out.append(
                    _issue(
                        "missing_dir",
                        kind,
                        name,
                        "Folder is missing or not a directory.",
                        [path] if path else [],
                    )
                )
    return out
