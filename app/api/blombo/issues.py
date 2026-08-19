from __future__ import annotations

from pathlib import Path
from typing import Any

from blombo import models
from blombo import wildcards as wildcard_meta


def list_issues() -> list[dict[str, Any]]:
    items = [*_duplicate_names("loras"), *_wildcard_invalid(), *_duplicate_headers()]
    items.sort(key=lambda row: (str(row["kind"]), str(row["code"]), str(row["name"])))
    return items


def _issue(code: str, kind: str, name: str, message: str, paths: list[str]) -> dict[str, Any]:
    return {"code": code, "kind": kind, "name": name, "message": message, "paths": paths}


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
