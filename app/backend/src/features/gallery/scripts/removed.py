from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from shared import dirs

from features.settings import service as settings
from features.models.scripts import model_files
from features.models.scripts import model_meta
from features.models.scripts import model_thumbs
from features.models.scripts import models
from features.models.scripts import thumbnail_embed
from features.models.scripts import thumbnail_scopes
from features.wildcards.scripts import files as wildcard_files
from config import USER, models_root, wildcards_root

REMOVED = USER / "removed"
GALLERY_KIND = "gallery"
_SKIP = {".gitkeep", "desktop.ini"}
_HOURS_DEFAULT = 48
_MAX_GB_DEFAULT = 100


class RemovedError(ValueError):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def remove_entry(kind: str, path: str) -> dict[str, Any]:
    kind = _kind(kind)
    ident = _ident(path)
    if _is_root(kind, ident):
        raise RemovedError("cannot remove a root folder")
    source = _entry(kind, ident)
    ids: list[str] = []
    if source.is_dir():
        for rel in _collect_files(kind, ident, source):
            ids.append(_trash_file(kind, rel))
        _prune_tree(source, _root_dir(kind, ident))
    else:
        ids.append(_trash_file(kind, ident))
    models.refresh_models(kind)
    _trim_size()
    return {"ids": ids, "count": len(ids)}


def remove_gallery_item(ident: str) -> dict[str, Any]:
    from features.gallery.scripts import cache as gallery_cache

    row = gallery_cache.row(ident)
    if not row:
        raise RemovedError("not found", 404)
    source = Path(str(row["path"]))
    if not dirs.allowed_file(source):
        raise RemovedError("not found", 404)
    if str(row["asset_kind"] or "image") in {"grid", "temp"}:
        raise RemovedError("cannot remove this item")
    uid = str(uuid.uuid4())
    dest = REMOVED / uid
    dest.mkdir(parents=True, exist_ok=True)
    size = int(source.stat().st_size)
    shutil.move(str(source), str(dest / source.name))
    try:
        favorite = int(row["favorite"] or 0)
    except (TypeError, ValueError, KeyError):
        favorite = 0
    man = {
        "kind": GALLERY_KIND,
        "ident": str(source),
        "name": source.name,
        "removed_at": time.time(),
        "size": size,
        "favorite": favorite,
        "gallery_id": str(row["id"]),
    }
    (dest / "manifest.json").write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    gallery_cache.forget_paths([str(source)])
    _trim_size()
    return {"ids": [uid], "count": 1}


def list_items() -> list[dict[str, Any]]:
    items = [_read_item(folder) for folder in _folders()]
    items = [item for item in items if item]
    items.sort(key=lambda row: float(row["removed_at"]), reverse=True)
    return items


def restore(item_id: str) -> dict[str, str]:
    folder = _item_dir(item_id)
    man = _manifest(folder)
    if str(man.get("kind") or "") == GALLERY_KIND:
        return _restore_gallery(folder, man)
    kind = _kind(str(man.get("kind") or ""))
    ident = _ident(str(man.get("ident") or ""))
    name = str(man.get("name") or "")
    if not ident or not name:
        raise RemovedError("invalid removed item")
    dest = _restore_dest(kind, ident, str(man.get("root") or ""))
    src = folder / name
    if not src.is_file():
        raise RemovedError("removed file is missing", 404)
    if dest.exists():
        raise RemovedError("a file already occupies that path")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    rows = _load_json(folder / "meta.json")
    meta = rows if isinstance(rows, dict) else {}
    model_meta.put_bundle(kind, {str(key): dict(val) for key, val in meta.items() if isinstance(val, dict)}, folder / "thumbs")
    shutil.rmtree(folder, ignore_errors=True)
    models.refresh_models(kind)
    return {"path": ident, "kind": "file"}


def _restore_gallery(folder: Path, man: dict[str, Any]) -> dict[str, str]:
    from features.gallery.scripts import cache as gallery_cache

    dest = _gallery_dest(str(man.get("ident") or ""))
    src = folder / str(man.get("name") or "")
    if not src.is_file():
        raise RemovedError("removed file is missing", 404)
    if dest.exists():
        raise RemovedError("a file already occupies that path")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    shutil.rmtree(folder, ignore_errors=True)
    ingested = gallery_cache.ingest(dest)
    if ingested and man.get("favorite"):
        gallery_cache.set_favorite(str(ingested["id"]), True)
    return {"path": str(dest), "kind": GALLERY_KIND}


def _gallery_dest(raw: str) -> Path:
    dest = Path(str(raw or ""))
    if not dest.is_absolute() or ".." in dest.parts:
        raise RemovedError("invalid path")
    try:
        real = dest.resolve()
    except OSError as exc:
        raise RemovedError("invalid path") from exc
    for root in dirs.gallery_roots():
        if real == root or root in real.parents:
            return dest
    raise RemovedError("original directory is no longer available")


def purge_permanent(item_id: str) -> None:
    folder = _item_dir(item_id)
    shutil.rmtree(folder)


def purge_all(kind: str | None = None) -> int:
    wanted = str(kind or "").strip()
    count = 0
    for folder in _folders():
        if wanted:
            man = _read_manifest(folder)
            if not man:
                continue
            item_kind = str(man.get("kind") or "")
            if wanted == GALLERY_KIND:
                if item_kind != GALLERY_KIND:
                    continue
            elif wanted == "models":
                if item_kind == GALLERY_KIND:
                    continue
            elif item_kind != wanted:
                continue
        shutil.rmtree(folder, ignore_errors=True)
        count += 1
    return count


def reveal(item_id: str) -> None:
    folder = _item_dir(item_id)
    if sys.platform != "win32":
        raise RemovedError("open folder is only supported on Windows")
    man = _manifest(folder)
    path = folder / str(man.get("name") or "")
    target = path if path.exists() else folder
    resolved = str(target.resolve())
    if target.is_file():
        subprocess.Popen(["explorer", "/select,", resolved])
        return
    os.startfile(resolved)


def thumb_file(
    item_id: str,
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> Path | None:
    folder = _item_dir(item_id)
    man = _manifest(folder)
    if str(man.get("kind") or "") == GALLERY_KIND:
        path = folder / str(man.get("name") or "")
        return path if path.is_file() else None
    ident = _ident(str(man.get("ident") or ""))
    thumbs = folder / "thumbs"
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    exact = _trash_thumb(thumbs, ident, key)
    if mode != "likely":
        if exact:
            return exact
        if fallback and key != model_thumbs.GLOBAL:
            return _trash_thumb(thumbs, ident, model_thumbs.GLOBAL)
        return None
    if exact:
        return exact
    ids = thumbnail_scopes.parse_context(key)
    best: tuple[tuple[int, int, int], Path] | None = None
    for path in _trash_thumbs(thumbs, ident):
        payload = thumbnail_embed.read_file(path)
        ctx = str(payload.get("context") or "") or model_thumbs._context_of(path)
        if not ctx or ctx == key or ctx == model_thumbs.GLOBAL:
            continue
        tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
        rank = thumbnail_scopes.rank_thumb(ids, ctx, tags, optional)
        if not rank:
            continue
        if best is None or rank > best[0]:
            best = (rank, path)
    if best:
        return best[1]
    if fallback:
        return _trash_thumb(thumbs, ident, model_thumbs.GLOBAL)
    return None


def thumb_meta(
    item_id: str,
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> dict[str, Any]:
    path = thumb_file(item_id, context, mode, fallback, optional)
    return thumbnail_embed.read_file(path) if path else {}


def purge_expired() -> None:
    hours = _hours()
    cutoff = time.time() - hours * 3600
    for folder in _folders():
        man = _read_manifest(folder)
        if not man:
            continue
        if float(man.get("removed_at") or 0) <= cutoff:
            shutil.rmtree(folder, ignore_errors=True)
    _trim_size()


def _trash_file(kind: str, ident: str) -> str:
    source = _entry(kind, ident)
    if not source.is_file():
        raise RemovedError("not found", 404)
    uid = str(uuid.uuid4())
    dest = REMOVED / uid
    dest.mkdir(parents=True, exist_ok=True)
    size = int(source.stat().st_size)
    shutil.move(str(source), str(dest / source.name))
    meta = model_meta.take_bundle(kind, ident, dest / "thumbs")
    (dest / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    man = {
        "kind": kind,
        "ident": ident,
        "name": source.name,
        "root": _root_name(kind, ident),
        "removed_at": time.time(),
        "size": size,
    }
    (dest / "manifest.json").write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    return uid


def _collect_files(kind: str, ident: str, folder: Path) -> list[str]:
    exts = wildcard_files.WILDCARD_EXTS if kind == "wildcards" else models.KINDS[kind]
    out: list[str] = []
    try:
        entries = list(folder.rglob("*"))
    except OSError:
        return out
    for entry in entries:
        name = entry.name
        if not entry.is_file() or name in _SKIP or name.startswith("."):
            continue
        if entry.suffix.lower() not in exts:
            continue
        rel = entry.relative_to(folder).as_posix()
        out.append(f"{ident}/{rel}" if ident else rel)
    out.sort(key=str.casefold)
    return out


def _restore_dest(kind: str, ident: str, root_name: str) -> Path:
    name = ident.replace("\\", "/").strip("/")
    if root_name:
        key = "wildcardDirs" if kind == "wildcards" else "modelDirs"
        extra = dirs.extra_named(key).get(root_name)
        if extra is None or not extra.is_dir():
            raise RemovedError("original directory is no longer available")
        rest = name.partition("/")[2] if name.startswith(root_name + "/") else name
        if kind == "wildcards":
            return extra / rest
        return extra / kind / rest
    path = wildcard_files._resolve(ident) if kind == "wildcards" else model_files._resolve(kind, ident)
    if path is None:
        raise RemovedError("invalid path")
    return path


def _root_name(kind: str, ident: str) -> str:
    name = ident.replace("\\", "/").strip("/")
    if not name or "/" not in name:
        return ""
    first = name.partition("/")[0]
    key = "wildcardDirs" if kind == "wildcards" else "modelDirs"
    return first if first in dirs.extra_named(key) else ""


def _root_dir(kind: str, ident: str) -> Path:
    root = _root_name(kind, ident)
    if kind == "wildcards":
        extra = dirs.extra_named("wildcardDirs").get(root) if root else None
        return extra if extra is not None else wildcards_root()
    extra = dirs.extra_named("modelDirs").get(root) if root else None
    return extra / kind if extra is not None else models_root() / kind


def _prune_tree(folder: Path, stop: Path) -> None:
    if not folder.is_dir():
        _prune_empty(folder.parent, stop)
        return
    try:
        for child in sorted(folder.rglob("*"), key=lambda path: len(path.parts), reverse=True):
            if child.is_dir():
                try:
                    child.rmdir()
                except OSError:
                    pass
    except OSError:
        pass
    _prune_empty(folder, stop)


def _prune_empty(path: Path, stop: Path) -> None:
    try:
        current = path if path.is_dir() else path.parent
        limit = stop.resolve()
        while current.is_dir() and current.resolve() != limit:
            parent = current.parent
            try:
                current.rmdir()
            except OSError:
                return
            current = parent
    except OSError:
        return


def _trim_size() -> None:
    cap = _max_gb() * 1024**3
    rows: list[tuple[float, int, Path]] = []
    total = 0
    for folder in _folders():
        man = _read_manifest(folder)
        if not man:
            continue
        size = _dir_size(folder)
        total += size
        rows.append((float(man.get("removed_at") or 0), size, folder))
    if total <= cap:
        return
    rows.sort(key=lambda row: row[0])
    for _when, size, folder in rows:
        if total <= cap:
            return
        shutil.rmtree(folder, ignore_errors=True)
        total -= size


def _dir_size(folder: Path) -> int:
    total = 0
    try:
        for path in folder.rglob("*"):
            if path.is_file():
                total += path.stat().st_size
    except OSError:
        return total
    return total


def _folders() -> list[Path]:
    if not REMOVED.is_dir():
        return []
    try:
        entries = list(REMOVED.iterdir())
    except OSError:
        return []
    out: list[Path] = []
    for path in entries:
        if path.is_dir() and _uuid_name(path.name):
            out.append(path)
    return out


def _item_dir(item_id: str) -> Path:
    try:
        uid = str(uuid.UUID(str(item_id)))
    except ValueError as exc:
        raise RemovedError("not found", 404) from exc
    folder = REMOVED / uid
    if not folder.is_dir():
        raise RemovedError("not found", 404)
    return folder


def _uuid_name(name: str) -> bool:
    try:
        return str(uuid.UUID(name)) == name
    except ValueError:
        return False


def _read_item(folder: Path) -> dict[str, Any] | None:
    man = _read_manifest(folder)
    if not man:
        return None
    ident = str(man.get("ident") or "")
    has_thumb = False
    if str(man.get("kind") or "") == GALLERY_KIND:
        has_thumb = (folder / str(man.get("name") or "")).is_file()
    else:
        thumbs = folder / "thumbs"
        if thumbs.is_dir():
            for path in thumbs.rglob("*"):
                if path.is_file() and path.suffix.lower() in model_meta.THUMB_EXTS:
                    has_thumb = True
                    break
    return {
        "id": folder.name,
        "kind": man.get("kind") or "",
        "name": man.get("name") or "",
        "ident": ident,
        "removed_at": float(man.get("removed_at") or 0),
        "size": int(man.get("size") or 0),
        "thumb": has_thumb,
    }


def _manifest(folder: Path) -> dict[str, Any]:
    man = _read_manifest(folder)
    if not man:
        raise RemovedError("not found", 404)
    return man


def _read_manifest(folder: Path) -> dict[str, Any] | None:
    data = _load_json(folder / "manifest.json")
    return data if isinstance(data, dict) else None


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _kind(kind: str) -> str:
    name = str(kind or "").strip()
    if name not in models.ALL_KINDS:
        raise RemovedError(f"unknown model kind: {kind}")
    return name


def _ident(rel: str) -> str:
    name = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if ".." in Path(name).parts:
        raise RemovedError("invalid path")
    return name.split("#", 1)[0]


def _is_root(kind: str, rel: str) -> bool:
    if kind == "wildcards":
        return wildcard_files._is_root(rel)
    return model_files._is_root(kind, rel)


def _entry(kind: str, rel: str) -> Path:
    try:
        if kind == "wildcards":
            return wildcard_files._entry(rel)
        return model_files._entry(kind, rel)
    except (model_files.ModelFileError, wildcard_files.WildcardError) as exc:
        raise RemovedError(str(exc), exc.status) from exc


def _trash_thumb(thumbs: Path, ident: str, context: str) -> Path | None:
    if ident:
        for ext in model_meta.THUMB_EXTS:
            path = Path(str(thumbs / ident / context) + ext)
            if path.is_file():
                return path
    return None


def _trash_thumbs(thumbs: Path, ident: str) -> list[Path]:
    if not thumbs.is_dir():
        return []
    out: list[Path] = []
    for folder in thumbs.iterdir():
        if not folder.is_dir():
            continue
        if folder.name != ident and not folder.name.startswith(f"{ident}#"):
            continue
        out.extend(path for path in folder.rglob("*") if path.is_file() and path.suffix.lower() in model_meta.THUMB_EXTS)
    if out:
        return out
    return []


def _hours() -> int:
    return _setting_int("removedAfterHours", _HOURS_DEFAULT, 1, 8760)


def _max_gb() -> int:
    return _setting_int("removedMaxGb", _MAX_GB_DEFAULT, 1, 10000)


def _setting_int(key: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(settings.load().get(key, default))))
    except (TypeError, ValueError):
        return default
