from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import gallery as gallery_repo

from shared import dirs
from shared import pnginfo
from config import outputs_root

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
_OUTPUT_CACHE: dict[str, tuple[int, int, dict[str, Any]]] = {}


def canonical(path: Path) -> Path:
    try:
        return path.resolve()
    except OSError:
        return Path(path.absolute())


def item_id(path: Path) -> str:
    digest = hashlib.sha1(str(canonical(path)).encode("utf-8")).hexdigest()
    return f"gallery:{digest}"


def _roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()
    for raw in dirs.gallery_roots():
        root = canonical(raw)
        key = str(root).casefold()
        if key in seen or not root.is_dir():
            continue
        seen.add(key)
        roots.append(root)
    return roots


def _root_for(path: Path, roots: list[Path]) -> Path:
    matches = [root for root in roots if path == root or root in path.parents]
    return max(matches, key=lambda root: len(str(root))) if matches else path.parent


def _iter_images(root: Path) -> list[Path]:
    try:
        return sorted(
            (
                canonical(path)
                for path in root.rglob("*")
                if path.is_file() and path.suffix.lower() in IMAGE_EXTS
            ),
            key=lambda path: str(path).casefold(),
        )
    except OSError:
        return []


def _asset_kind(path: Path, root: Path | None = None) -> str:
    parts = {part.casefold() for part in path.parts}
    if root is not None and canonical(outputs_root()) == root and ("grids" in parts or "grid" in parts):
        return "grid"
    if "interrupted" in parts:
        return "interrupted"
    return "image"


def _timestamp(value: Any, fallback: float) -> str:
    if isinstance(value, str) and value.strip():
        return value
    return datetime.fromtimestamp(fallback, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _file_metadata(path: Path) -> tuple[dict[str, Any], int | None, int | None, str]:
    try:
        stat = path.stat()
        raw = path.read_bytes()
    except OSError:
        return {}, None, None, ""
    try:
        from PIL import Image

        with Image.open(path) as image:
            width, height = image.size
    except Exception:
        width = height = None
    try:
        info = pnginfo.read(raw, str(path))
    except Exception:
        info = {}
    metadata = info.get("metadata") if isinstance(info, dict) else None
    metadata = metadata if isinstance(metadata, dict) else {}
    params = metadata.get("params")
    params = dict(params) if isinstance(params, dict) else pnginfo.parse_parameters(str(info.get("text") or ""))
    if not isinstance(params, dict):
        params = {}
    if metadata:
        aliases = {
            "workflow_id": "workflow",
            "template_id": "template_id",
            "template_name": "template_name",
            "template_params": "template_params",
            "created_at": "created_at",
            "asset_kind": "asset_kind",
        }
        for source, target in aliases.items():
            if metadata.get(source) is not None:
                params.setdefault(target, metadata[source])
        if metadata.get("job_id") is not None:
            params.setdefault("job_id", metadata["job_id"])
        for key in ("sidecar", "sidecar_for"):
            if metadata.get(key) is not None:
                params.setdefault(key, metadata[key])
    return params, width, height, _timestamp(metadata.get("created_at"), stat.st_mtime)


def _row_values(path: Path, root: Path, ident: str | None = None) -> dict[str, Any]:
    params, width, height, created_at = _file_metadata(path)
    try:
        stat = path.stat()
        size = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
    except OSError:
        size = 0
        mtime_ns = 0
    kind = str(params.get("asset_kind") or _asset_kind(path, root))
    if kind not in {"image", "interrupted", "grid"}:
        kind = _asset_kind(path, root)
    return {
        "id": ident or item_id(path),
        "path": str(path),
        "root": str(root),
        "asset_kind": kind,
        "size": size,
        "mtime_ns": mtime_ns,
        "width": width,
        "height": height,
        "seed": _int(params.get("seed")),
        "checkpoint_name": str(params.get("checkpoint") or ""),
        "prompt": str(params.get("prompt") or params.get("prompt_clip") or ""),
        "negative_prompt": str(params.get("negative_prompt") or params.get("negative_clip") or ""),
        "params_json": json.dumps(params, ensure_ascii=False),
        "created_at": created_at,
    }


def _is_sidecar(path: Path, params: dict[str, Any], root: Path | None = None) -> bool:
    if params.get("sidecar"):
        return True
    if root is None or canonical(outputs_root()) != root or path.suffix.lower() not in {".jpg", ".jpeg"}:
        return False
    return any(path.with_suffix(ext).is_file() for ext in (".png", ".webp"))


def _insert_or_update(conn: Any, values: dict[str, Any], existing: Any) -> None:
    gallery_repo.upsert(conn, values, existing)


def sync() -> None:
    roots = _roots()
    root_keys = [str(root) for root in roots]
    seen: set[str] = set()

    def write(conn: Any) -> None:
        for root in roots:
            for path in _iter_images(root):
                key = str(path)
                if key in seen:
                    continue
                try:
                    stat = path.stat()
                    size = int(stat.st_size)
                    mtime_ns = int(stat.st_mtime_ns)
                except OSError:
                    continue
                existing = gallery_repo.fetch_by_path(conn, key)
                scan_root = _root_for(path, roots)
                if (
                    existing
                    and int(existing["size"]) == size
                    and int(existing["mtime_ns"]) == mtime_ns
                    and str(existing["root"]) == str(scan_root)
                ):
                    try:
                        cached_params = json.loads(existing["params_json"] or "{}")
                    except (TypeError, json.JSONDecodeError):
                        cached_params = {}
                    if isinstance(cached_params, dict) and _is_sidecar(path, cached_params, scan_root):
                        continue
                    seen.add(key)
                    continue
                params, _, _, _ = _file_metadata(path)
                if _is_sidecar(path, params, scan_root):
                    continue
                seen.add(key)
                values = _row_values(path, scan_root)
                _insert_or_update(conn, values, existing)
        if root_keys:
            gallery_repo.delete_stale(conn, root_keys, seen)
        else:
            gallery_repo.delete_all(conn)

    gallery_repo.transaction(write)


def list_rows(limit: int = 200, hide_interrupted: bool = True) -> list[Any]:
    sync()
    cap = max(1, min(200, int(limit)))
    clauses = ["asset_kind != 'grid'"]
    if hide_interrupted:
        clauses.append("asset_kind != 'interrupted'")
    return gallery_repo.list_items(" AND ".join(clauses), (cap,))


def row(ident: str) -> Any | None:
    lookup = f"gallery:{ident[5:]}" if ident.startswith("disk:") else ident
    return gallery_repo.get_by_id(lookup)


def row_for_path(path: str) -> Any | None:
    return gallery_repo.get_by_path(str(path))


def latest_non_grid() -> Any | None:
    return gallery_repo.latest_non_grid()


def output_row(output: dict[str, Any]) -> dict[str, Any] | None:
    ident = str(output.get("id") or "")
    path = Path(str(output.get("path") or ""))
    if not ident or not path.is_file():
        return None
    try:
        stat = path.stat()
        cache_key = str(path)
        cached_output = _OUTPUT_CACHE.get(cache_key)
        if cached_output and cached_output[:2] == (int(stat.st_size), int(stat.st_mtime_ns)):
            return dict(cached_output[2])
    except OSError:
        return None
    cached = row(ident) or row_for_path(str(path))
    if cached:
        result = dict(cached)
    else:
        roots = _roots()
        result = _row_values(path, _root_for(canonical(path), roots), ident=ident)
    _OUTPUT_CACHE[str(path)] = (int(stat.st_size), int(stat.st_mtime_ns), result)
    return dict(result)


def path_for_id(ident: str) -> Path | None:
    cached = row(ident)
    if not cached:
        sync()
        cached = row(ident)
    if not cached:
        return None
    path = Path(str(cached["path"]))
    return path if dirs.allowed_file(path) else None
