from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import gallery as gallery_repo

from features.gallery.scripts import index as gallery_index
from features.gallery.scripts import relink as gallery_relink
from features.generate.scripts import save_meta
from shared import dirs
from shared import pnginfo
from config import RUNTIME, USER, outputs_root, valid_profile_id

IMAGE_EXTS = gallery_index.IMAGE_EXTS
VIDEO_EXTS = gallery_index.VIDEO_EXTS
MEDIA_EXTS = gallery_index.MEDIA_EXTS
_OUTPUT_CACHE: dict[str, tuple[int, int, dict[str, Any]]] = {}
_SYNC_LOCK = threading.Lock()
_SYNC_THREAD: threading.Thread | None = None
_SYNC_AGAIN = False
_SYNC_BATCH = 250


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


def _iter_media(root: Path) -> list[Path]:
    try:
        return sorted(
            (
                canonical(path)
                for path in root.rglob("*")
                if path.is_file() and path.suffix.lower() in MEDIA_EXTS
            ),
            key=lambda path: str(path).casefold(),
        )
    except OSError:
        return []


def _under_runtime_tmp(path: Path) -> bool:
    try:
        path.resolve().relative_to((RUNTIME / "tmp").resolve())
        return True
    except (OSError, ValueError):
        return False


def _asset_kind(path: Path, root: Path | None = None) -> str:
    if _under_runtime_tmp(path):
        return "temp"
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


def _file_metadata(path: Path) -> tuple[dict[str, Any], int | None, int | None, str] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    if path.suffix.lower() in VIDEO_EXTS:
        return None
    try:
        info = pnginfo.read_path(path)
    except Exception:
        return None
    metadata = info.get("metadata") if isinstance(info, dict) else None
    if not save_meta.valid_meta(metadata):
        return None
    params = dict(metadata.get("params") or {})
    for key in ("workflow_id", "template_id", "template_name", "template_params", "job_id", "asset_kind"):
        if metadata.get(key) is not None:
            params[key] = metadata[key]
    for key in ("sidecar", "sidecar_for"):
        if metadata.get(key) is not None:
            params[key] = metadata[key]
    width = info.get("width")
    height = info.get("height")
    try:
        width = int(width) if width is not None else None
        height = int(height) if height is not None else None
    except (TypeError, ValueError):
        width = height = None
    return params, width, height, _timestamp(metadata.get("created_at"), stat.st_mtime)


def _row_values(path: Path, root: Path, ident: str | None = None) -> dict[str, Any] | None:
    if path.suffix.lower() in VIDEO_EXTS:
        try:
            stat = path.stat()
        except OSError:
            return None
        return {
            "id": ident or item_id(path),
            "path": str(path),
            "root": str(root),
            "asset_kind": _asset_kind(path, root),
            "media_kind": gallery_index.media_kind(path),
            "size": int(stat.st_size),
            "mtime_ns": int(stat.st_mtime_ns),
            "width": None,
            "height": None,
            "seed": None,
            "checkpoint_name": "",
            "prompt": "",
            "negative_prompt": "",
            "params_json": "{}",
            "created_at": _timestamp(None, stat.st_mtime),
        }
    parsed = _file_metadata(path)
    if not parsed:
        return None
    params, width, height, created_at = parsed
    try:
        stat = path.stat()
        size = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
    except OSError:
        size = 0
        mtime_ns = 0
    kind = str(params.get("asset_kind") or _asset_kind(path, root))
    if kind not in {"image", "interrupted", "grid", "temp"}:
        kind = _asset_kind(path, root)
    if _under_runtime_tmp(path):
        kind = "temp"
    return {
        "id": ident or item_id(path),
        "path": str(path),
        "root": str(root),
        "asset_kind": kind,
        "media_kind": gallery_index.media_kind(path),
        "size": size,
        "mtime_ns": mtime_ns,
        "width": width,
        "height": height,
        "seed": _int(params.get("seed")),
        "checkpoint_name": gallery_index.checkpoint_name(params),
        "prompt": str(params.get("prompt") or ""),
        "negative_prompt": str(params.get("negative_prompt") or ""),
        "params_json": json.dumps(params, ensure_ascii=False),
        "created_at": created_at,
    }


def _is_sidecar(path: Path, params: dict[str, Any], root: Path | None = None) -> bool:
    if params.get("sidecar"):
        return True
    if root is None or canonical(outputs_root()) != root or path.suffix.lower() not in {".jpg", ".jpeg"}:
        return False
    return any(path.with_suffix(ext).is_file() for ext in (".png", ".webp"))


def _params_of(values: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(values.get("params_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        data = {}
    return data if isinstance(data, dict) else {}


def _write_row(conn: Any, values: dict[str, Any], existing: Any) -> None:
    gallery_repo.upsert(conn, values, existing)
    gallery_repo.replace_links(conn, values["id"], gallery_index.links(_params_of(values), str(values.get("prompt") or "")))


def ingest(path: Path, ident: str | None = None) -> dict[str, Any] | None:
    path = canonical(path)
    if not path.is_file() or path.suffix.lower() not in MEDIA_EXTS:
        return None
    try:
        stat = path.stat()
        size = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
    except OSError:
        return None
    roots = _roots()
    root = _root_for(path, roots)
    values = _row_values(path, root, ident=ident)
    if not values or _is_sidecar(path, _params_of(values), root):
        _mark_seen(str(path), size, mtime_ns, False)
        return None

    def write(conn: Any) -> None:
        existing = gallery_repo.fetch_by_path(conn, values["path"])
        _write_row(conn, values, existing)
        gallery_repo.upsert_seen(conn, values["path"], size, mtime_ns, True)

    gallery_repo.transaction(write)
    _OUTPUT_CACHE[values["path"]] = (int(values["size"]), int(values["mtime_ns"]), dict(values))
    return dict(values)


def start_sync(*, again: bool = True) -> bool:
    global _SYNC_THREAD, _SYNC_AGAIN
    with _SYNC_LOCK:
        if _SYNC_THREAD is not None and _SYNC_THREAD.is_alive():
            if again:
                _SYNC_AGAIN = True
            return True
        _SYNC_AGAIN = False
        _SYNC_THREAD = threading.Thread(target=_sync_safe, daemon=True, name="gallery-sync")
        _SYNC_THREAD.start()
        return True


def _sync_safe() -> None:
    global _SYNC_AGAIN
    while True:
        try:
            sync()
        except Exception:
            pass
        with _SYNC_LOCK:
            if not _SYNC_AGAIN:
                return
            _SYNC_AGAIN = False


def _mark_seen(path: str, size: int, mtime_ns: int, ok: bool) -> None:
    gallery_repo.transaction(lambda conn: gallery_repo.upsert_seen(conn, path, size, mtime_ns, ok))


def _refresh_links(existing: Any) -> None:
    ident = str(existing["id"])
    try:
        cached_params = json.loads(existing["params_json"] or "{}")
    except (TypeError, json.JSONDecodeError):
        cached_params = {}
    if not isinstance(cached_params, dict):
        return
    checkpoint = gallery_index.checkpoint_name(cached_params)
    links = gallery_index.links(cached_params, str(existing["prompt"] or ""))

    def write(conn: Any) -> None:
        if checkpoint != str(existing["checkpoint_name"] or ""):
            conn.execute(
                "UPDATE gallery_items SET checkpoint_name = ? WHERE id = ?",
                (checkpoint, ident),
            )
        current = {
            str(row["name"])
            for row in conn.execute("SELECT name FROM gallery_item_loras WHERE item_id = ?", (ident,))
        }
        if current != set(links["loras"]):
            gallery_repo.replace_links(conn, ident, links)
            return
        if not (links["tags"] or links["loras"] or links["wildcards"]):
            return
        for table in ("gallery_item_tags", "gallery_item_loras", "gallery_item_wildcards"):
            if conn.execute(f"SELECT 1 FROM {table} WHERE item_id = ? LIMIT 1", (ident,)).fetchone():
                return
        gallery_repo.replace_links(conn, ident, links)

    gallery_repo.transaction(write)


def _cached_ok(path: Path, key: str, size: int, mtime_ns: int, scan_root: Path, existing: Any) -> bool:
    if path.suffix.lower() in VIDEO_EXTS:
        _mark_seen(key, size, mtime_ns, True)
        return True
    try:
        cached_params = json.loads(existing["params_json"] or "{}")
    except (TypeError, json.JSONDecodeError):
        cached_params = {}
    if not save_meta.valid_params(cached_params) or _is_sidecar(path, cached_params, scan_root):
        return False
    _refresh_links(existing)
    _mark_seen(key, size, mtime_ns, True)
    return True


def sync() -> None:
    _relocate_index()
    roots = _roots()
    root_keys = [str(root) for root in roots]
    disk: set[str] = set()
    items: set[str] = set()
    seen_map = {
        str(row["path"]): row
        for row in gallery_repo.query("SELECT path, size, mtime_ns, ok FROM gallery_seen")
    }
    exist_map = {str(row["path"]): row for row in gallery_repo.query("SELECT * FROM gallery_items")}
    pending: list[tuple[Any, ...]] = []

    def flush() -> None:
        if not pending:
            return
        batch = list(pending)
        pending.clear()

        def write(conn: Any) -> None:
            for op in batch:
                kind = op[0]
                if kind == "row":
                    _, values, p, n, m = op
                    _write_row(conn, values, gallery_repo.fetch_by_path(conn, values["path"]))
                    gallery_repo.upsert_seen(conn, p, n, m, True)
                    continue
                _, p, n, m, ok = op
                gallery_repo.upsert_seen(conn, p, n, m, bool(ok))

        gallery_repo.transaction(write)

    for root in roots:
        for path in _iter_media(root):
            key = str(path)
            if key in disk:
                continue
            try:
                stat = path.stat()
                size = int(stat.st_size)
                mtime_ns = int(stat.st_mtime_ns)
            except OSError:
                continue
            disk.add(key)
            scan_root = _root_for(path, roots)
            seen_row = seen_map.get(key)
            existing = exist_map.get(key)
            if seen_row and int(seen_row["size"]) == size and int(seen_row["mtime_ns"]) == mtime_ns:
                if int(seen_row["ok"]) and existing:
                    items.add(key)
                    continue
                if not int(seen_row["ok"]):
                    continue
            if (
                existing
                and int(existing["size"]) == size
                and int(existing["mtime_ns"]) == mtime_ns
                and str(existing["root"]) == str(scan_root)
                and _cached_ok(path, key, size, mtime_ns, scan_root, existing)
            ):
                items.add(key)
                continue
            values = _row_values(path, scan_root, ident=str(existing["id"]) if existing else None)
            if values and not _is_sidecar(path, _params_of(values), scan_root):
                items.add(key)
                pending.append(("row", values, key, size, mtime_ns))
                exist_map[key] = values
                if len(pending) >= _SYNC_BATCH:
                    flush()
                continue
            pending.append(("seen", key, size, mtime_ns, False))
            if len(pending) >= _SYNC_BATCH:
                flush()
    flush()

    def finish(conn: Any) -> None:
        if root_keys:
            gallery_repo.delete_stale(conn, root_keys, items)
        else:
            gallery_repo.delete_all(conn)
        gallery_repo.delete_stale_seen(conn, disk)

    gallery_repo.transaction(finish)
    gallery_relink.relink_digests()


def _relocate_index() -> None:
    dest_root = str(canonical(outputs_root())).casefold()
    output = str(canonical(USER / "output")).casefold()
    for row in gallery_repo.list_locations():
        raw = str(row["path"] or "")
        key = raw.casefold()
        if key.startswith(dest_root) or not key.startswith(output):
            continue
        resolve_path(row, forget_missing=False)


def _is_flat_output(path: Path) -> bool:
    try:
        rel = canonical(path).relative_to(canonical(USER / "output"))
    except (OSError, ValueError):
        return False
    parts = rel.parts
    return bool(parts) and not valid_profile_id(parts[0])


def _relocate_dest(path: Path) -> Path | None:
    dest_root = canonical(outputs_root())
    try:
        rel = canonical(path).relative_to(canonical(USER / "output"))
    except (OSError, ValueError):
        return None
    parts = rel.parts
    if not parts:
        return None
    if valid_profile_id(parts[0]):
        if len(parts) < 2:
            return None
        rel = Path(*parts[1:])
    dest = dest_root / rel
    try:
        if canonical(dest) == canonical(path):
            return None
    except OSError:
        pass
    return dest


def _move_into(src: Path, dest: Path) -> bool:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            return dest.is_file()
        src.replace(dest)
        return dest.is_file()
    except OSError:
        return False


def _commit_relocate(ident: str, old_path: str, dest: Path) -> bool:
    dest = canonical(dest)
    root = _root_for(dest, _roots())
    _OUTPUT_CACHE.pop(old_path, None)
    if not gallery_repo.rewrite_location(ident, old_path, str(dest), str(root)):
        forget_paths([old_path])
        return False
    return True


def resolve_path(row: Any, *, forget_missing: bool = True) -> Path | None:
    ident = str(row["id"] or "")
    raw = str(row["path"] or "")
    if not ident or not raw:
        return None
    path = Path(raw)
    dest = _relocate_dest(path)
    try:
        if path.is_file() and dest is None:
            return path
    except OSError:
        pass
    if dest is not None:
        if dest.is_file() and dirs.allowed_file(dest):
            return dest if _commit_relocate(ident, raw, dest) else None
        if path.is_file() and _is_flat_output(path) and _move_into(path, dest) and dirs.allowed_file(dest):
            return dest if _commit_relocate(ident, raw, dest) else None
    if forget_missing:
        forget_paths([raw])
    return None


def list_rows(limit: int = 200, hide_interrupted: bool = True) -> list[Any]:
    cap = max(1, min(200, int(limit)))
    clauses = ["asset_kind != 'grid'", "asset_kind != 'temp'"]
    if hide_interrupted:
        clauses.append("asset_kind != 'interrupted'")
    return gallery_repo.query(
        f"SELECT {gallery_repo.PUBLIC_SELECT}, path FROM gallery_items WHERE {' AND '.join(clauses)} "
        "ORDER BY created_at DESC, id DESC LIMIT ?",
        (cap,),
    )


def list_since(created_at: str, hide_interrupted: bool = True, limit: int = 60) -> list[Any]:
    stamp = str(created_at or "").strip()
    if not stamp:
        return []
    cap = max(1, min(60, int(limit)))
    clauses = ["asset_kind != 'grid'", "asset_kind != 'temp'", "created_at > ?"]
    params: list[Any] = [stamp, cap]
    if hide_interrupted:
        clauses.insert(1, "asset_kind != 'interrupted'")
    return gallery_repo.list_items(" AND ".join(clauses), params)


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
        size = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
    except OSError:
        return None
    cached = row(ident) or row_for_path(str(path))
    if cached and int(cached["size"]) == size and int(cached["mtime_ns"]) == mtime_ns:
        result = dict(cached)
        _OUTPUT_CACHE[str(path)] = (size, mtime_ns, result)
        return dict(result)
    result = ingest(path, ident)
    if not result:
        return None
    _OUTPUT_CACHE[str(path)] = (size, mtime_ns, result)
    return dict(result)


def path_for_id(ident: str) -> Path | None:
    cached = row(ident)
    if not cached:
        return None
    return resolve_path(cached, forget_missing=False)


def set_favorite(ident: str, favorite: bool) -> Any | None:
    cached = row(ident)
    if not cached:
        return None
    kind = str(cached["asset_kind"] or "image")
    if kind in {"grid", "temp"}:
        raise ValueError("cannot favorite this item")
    updated = gallery_repo.set_favorite(ident, bool(favorite))
    _OUTPUT_CACHE.pop(str(cached["path"]), None)
    return updated


def forget_paths(paths: list[str]) -> None:
    keys: list[str] = []
    for raw in paths:
        text = str(raw)
        _OUTPUT_CACHE.pop(text, None)
        try:
            keys.append(str(canonical(Path(text))))
        except OSError:
            keys.append(text)
        if text not in keys:
            keys.append(text)
    gallery_repo.delete_paths(keys)
