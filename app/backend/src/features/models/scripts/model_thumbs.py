from __future__ import annotations

import time
from io import BytesIO
from pathlib import Path
from typing import Any

from infrastructure.storage.repositories import model_meta as model_meta_db
from config import USER
from features.models.scripts import thumbnail_embed
from features.models.scripts import thumbnail_scopes
from .model_thumb_storage import (
    drop_context,
    drop_ident,
    ident_index,
    load_index,
    prune_empty,
    relocate,
    set_index,
    write_index,
)

ROOT = USER / "model_thumbs"
THUMBS = ROOT
THUMB_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4")
THUMB_MAX = 512
_FORMATS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
_MEDIA = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
}
GLOBAL = thumbnail_scopes.GLOBAL_ID


def thumb_dir(kind: str, ident: str) -> Path:
    return THUMBS / kind / ident


def thumb_paths(kind: str, ident: str, context: str = GLOBAL) -> list[Path]:
    base = thumb_dir(kind, ident) / context
    return [Path(str(base) + ext) for ext in THUMB_EXTS]


def thumb_at(kind: str, ident: str, context: str = GLOBAL) -> Path | None:
    for path in thumb_paths(kind, ident, context):
        if path.is_file():
            return path
    return None


def thumb_file(kind: str, rel: str, context: str = GLOBAL) -> Path | None:
    ident = _ident(rel)
    if not ident:
        return None
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    return thumb_at(kind, ident, key)


def thumb_mtime(kind: str, rel: str, context: str = GLOBAL) -> int:
    path = thumb_file(kind, rel, context)
    return _mtime(path)


def thumb_media(path: Path) -> str:
    return _MEDIA.get(path.suffix.lower(), "application/octet-stream")


def resolved_file(
    kind: str,
    rel: str,
    context: str = GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> Path | None:
    ident = _ident(rel)
    if not ident:
        return None
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    exact = thumb_at(kind, ident, key)
    if mode != "likely":
        if exact:
            return exact
        if fallback and key != GLOBAL:
            return thumb_at(kind, ident, GLOBAL)
        return None
    if exact:
        return exact
    ids = thumbnail_scopes.parse_context(key)
    best: tuple[tuple[int, int, int], int, Path] | None = None
    for ctx, row in ident_index(kind, ident).items():
        if ctx == key or ctx == GLOBAL:
            continue
        path = thumb_at(kind, ident, ctx)
        if not path:
            continue
        rank = thumbnail_scopes.rank_thumb(
            ids, ctx, row.get("tags") if isinstance(row, dict) else None, optional
        )
        if not rank:
            continue
        score = (rank, _mtime(path), path)
        if best is None or score[0] > best[0] or (score[0] == best[0] and score[1] > best[1]):
            best = score
    if best:
        return best[2]
    if fallback:
        return thumb_at(kind, ident, GLOBAL)
    return None


def resolved_mtime(
    kind: str,
    rel: str,
    context: str,
    mode: str,
    fallback: bool,
    optional: list[str] | None = None,
) -> int:
    return _mtime(resolved_file(kind, rel, context, mode, fallback, optional))


def save_thumb(
    kind: str,
    rel: str,
    data: bytes,
    context: str = GLOBAL,
    meta: dict[str, Any] | None = None,
    media: str = "",
) -> int:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context))
    from PIL import Image

    ext = _media_ext(data, media)
    image = None
    if ext == ".gif":
        try:
            image = Image.open(BytesIO(data))
            image.verify()
        except Exception as exc:
            raise ValueError("could not read gif") from exc
    elif ext == ".mp4":
        if not _is_mp4(data):
            raise ValueError("could not read mp4")
    else:
        try:
            image = Image.open(BytesIO(data))
            image.load()
        except Exception as exc:
            raise ValueError("could not read image") from exc
    if ext in (".gif", ".mp4"):
        source = thumbnail_embed.extract_source(data) if image is not None else {}
        if meta:
            _apply_meta(source, meta)
        payload = thumbnail_embed.pack(key, source)
        dest = Path(str(thumb_dir(kind, ident) / key) + ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        for old in thumb_paths(kind, ident, key):
            if old != dest and old.is_file():
                old.unlink()
        dest.write_bytes(data)
        stamp = int(dest.stat().st_mtime)
        set_index(kind, ident, key, stamp, payload.get("tags") if isinstance(payload.get("tags"), list) else [])
        return stamp
    assert image is not None
    fmt = (image.format or "").upper()
    ext = _FORMATS.get(fmt)
    if not ext:
        raise ValueError("use png, jpg, or webp")
    if max(image.size) > THUMB_MAX:
        image.thumbnail((THUMB_MAX, THUMB_MAX))
    source = thumbnail_embed.extract_source(data)
    if meta:
        _apply_meta(source, meta)
    payload = thumbnail_embed.pack(key, source)
    dest = Path(str(thumb_dir(kind, ident) / key) + ext)
    dest.parent.mkdir(parents=True, exist_ok=True)
    for old in thumb_paths(kind, ident, key):
        if old != dest and old.is_file():
            old.unlink()
    thumbnail_embed.write_image(image, fmt, payload, dest)
    stamp = int(dest.stat().st_mtime)
    set_index(kind, ident, key, stamp, payload.get("tags") if isinstance(payload.get("tags"), list) else [])
    return stamp


def delete_thumb(kind: str, rel: str, context: str | None = None, all_contexts: bool = False) -> None:
    ident = _ident(rel)
    if not ident:
        raise ValueError("invalid path")
    if all_contexts:
        folder = thumb_dir(kind, ident)
        if folder.is_dir():
            for path in list(folder.glob("*")):
                if path.is_file():
                    path.unlink(missing_ok=True)
            prune_empty(folder, THUMBS / kind)
        drop_ident(kind, ident)
        return
    key = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(context or GLOBAL))
    for path in thumb_paths(kind, ident, key):
        if path.is_file():
            path.unlink()
    drop_context(kind, ident, key)
    prune_empty(thumb_dir(kind, ident), THUMBS / kind)


def drop_scope(scope_id: str) -> None:
    name = str(scope_id or "").strip().lower()
    if not name or name == GLOBAL:
        return
    data = load_index()
    changed = False
    for kind, rows in list(data.items()):
        root = THUMBS / kind
        if not isinstance(rows, dict):
            continue
        for ident, contexts in list(rows.items()):
            if not isinstance(contexts, dict):
                continue
            for key in list(contexts):
                parts = thumbnail_scopes.parse_context(key)
                if name not in parts:
                    continue
                for path in thumb_paths(kind, ident, key):
                    if path.is_file():
                        path.unlink()
                contexts.pop(key, None)
                changed = True
            if not contexts:
                rows.pop(ident, None)
                prune_empty(thumb_dir(kind, ident), root)
        if not rows:
            data.pop(kind, None)
    if changed:
        write_index(data)


def iter_idents(kind: str) -> list[str]:
    folder = THUMBS / kind
    if not folder.is_dir():
        return []
    out: list[str] = []
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        ident = _ident_of(folder, path)
        if ident and ident not in out:
            out.append(ident)
    return out


def move_thumbs(kind: str, old: str, new: str) -> None:
    src_ident = _ident(old)
    dest_ident = _ident(new)
    if not src_ident or not dest_ident or src_ident == dest_ident:
        return

    def mapped(key: str) -> str | None:
        if key == src_ident:
            return dest_ident
        for sep in ("/", "#"):
            if key.startswith(src_ident + sep):
                return dest_ident + key[len(src_ident) :]
        return None

    idents = [ident for ident in iter_idents(kind) if mapped(ident)]
    idents.sort(key=len, reverse=True)
    for ident in idents:
        nxt = mapped(ident)
        if nxt:
            _move_ident(kind, ident, nxt)
    data = load_index()
    rows = data.get(kind)
    if not isinstance(rows, dict):
        return
    out: dict[str, Any] = {}
    changed = False
    for key, value in rows.items():
        nxt = mapped(str(key))
        if not nxt:
            out[key] = value
            continue
        changed = True
        if nxt not in rows and nxt not in out:
            out[nxt] = value
    if changed:
        data[kind] = out
        write_index(data)


def take(kind: str, ident: str, dest: Path) -> None:
    src = _ident(ident)
    if not src:
        return
    dest.mkdir(parents=True, exist_ok=True)
    root = THUMBS / kind
    for thumb_ident in list(iter_idents(kind)):
        if thumb_ident != src and not thumb_ident.startswith(src + "#"):
            continue
        folder = thumb_dir(kind, thumb_ident)
        if not folder.is_dir():
            continue
        for file in list(folder.iterdir()):
            if not file.is_file():
                continue
            try:
                rel = file.relative_to(root)
            except ValueError:
                rel = Path(thumb_ident) / file.name
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            relocate(file, out)
        prune_empty(folder, root)
        drop_ident(kind, thumb_ident)


def put(kind: str, thumbs: Path) -> None:
    if not thumbs.is_dir():
        return
    root = THUMBS / kind
    root.mkdir(parents=True, exist_ok=True)
    for file in thumbs.rglob("*"):
        if not file.is_file():
            continue
        dest = root / file.relative_to(thumbs)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            continue
        relocate(file, dest)
        ident = _ident_of(root, dest)
        context = _context_of(dest)
        if ident and context:
            payload = thumbnail_embed.read_file(dest)
            tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
            set_index(kind, ident, context, _mtime(dest), tags)


def contexts(kind: str, rel: str) -> dict[str, dict[str, Any]]:
    ident = _ident(rel)
    if not ident:
        return {}
    return ident_index(kind, ident)


LOOKUP_KINDS = ("checkpoints", "loras", "wildcards")


def list_saved() -> list[dict[str, Any]]:
    data = load_index()
    out: list[dict[str, Any]] = []
    for kind in LOOKUP_KINDS:
        rows = data.get(kind)
        if not isinstance(rows, dict):
            continue
        for ident, contexts in rows.items():
            if not isinstance(contexts, dict):
                continue
            path = str(ident)
            for ctx, meta in contexts.items():
                key = str(ctx)
                if not thumbnail_scopes.is_context_key(key):
                    continue
                ids = thumbnail_scopes.parse_context(key)
                file = thumb_at(kind, str(ident), key)
                stamp = int(meta.get("mtime") or 0) if isinstance(meta, dict) else 0
                out.append(
                    {
                        "kind": kind,
                        "path": path,
                        "context": key,
                        "scopes": [item for item in ids if item != GLOBAL],
                        "mtime": stamp,
                        "media": thumb_media(file) if file else "",
                    }
                )
    out.sort(key=lambda row: (-int(row["mtime"]), str(row["kind"]), str(row["path"])))
    return out


def rebuild_index() -> None:
    data: dict[str, dict[str, dict[str, Any]]] = {}
    if THUMBS.is_dir():
        for kind_dir in THUMBS.iterdir():
            if not kind_dir.is_dir():
                continue
            kind = kind_dir.name
            for path in kind_dir.rglob("*"):
                if not path.is_file():
                    continue
                ident = _ident_of(kind_dir, path)
                context = _context_of(path)
                if not ident or not context:
                    continue
                payload = thumbnail_embed.read_file(path)
                tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
                data.setdefault(kind, {}).setdefault(ident, {})[context] = {
                    "mtime": _mtime(path),
                    "tags": [str(item) for item in tags if str(item).strip()],
                }
    write_index(data)


def _ident(rel: str) -> str | None:
    ident = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if not ident or ".." in Path(ident).parts:
        return None
    return ident


def _media_ext(data: bytes, media: str) -> str:
    mime = str(media or "").split(";", 1)[0].strip().lower()
    if mime == "image/gif" or data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if mime == "video/mp4" or _is_mp4(data):
        return ".mp4"
    return ""


def _is_mp4(data: bytes) -> bool:
    return len(data) >= 12 and data[4:8] == b"ftyp"


def _apply_meta(source: dict[str, Any], meta: dict[str, Any]) -> None:
    if meta.get("tags") is not None:
        source["tags"] = meta.get("tags")
    if meta.get("prompt"):
        source["prompt"] = str(meta["prompt"])
    if meta.get("parameters"):
        source["parameters"] = str(meta["parameters"])
    if isinstance(meta.get("raw"), dict):
        source["raw"] = meta["raw"]
    if meta.get("origin"):
        source["origin"] = str(meta["origin"])
    if isinstance(meta.get("civitai"), dict):
        source["civitai"] = meta["civitai"]


def _thumb_ext(name: str) -> str:
    lower = name.lower()
    return next((item for item in THUMB_EXTS if lower.endswith(item)), "")


def _context_of(path: Path) -> str:
    ext = _thumb_ext(path.name)
    if not ext:
        return ""
    name = path.name[: -len(ext)]
    return name if thumbnail_scopes.is_context_key(name) else ""


def _ident_of(kind_dir: Path, path: Path) -> str | None:
    context = _context_of(path)
    if not context:
        return None
    try:
        rel = path.parent.relative_to(kind_dir).as_posix()
    except ValueError:
        return None
    return _ident(rel)


def _mtime(path: Path | None) -> int:
    if not path or not path.is_file():
        return 0
    try:
        return int(path.stat().st_mtime)
    except OSError:
        return 0




def _move_ident(kind: str, old: str, new: str) -> None:
    src = thumb_dir(kind, old)
    if not src.exists():
        return
    dest = thumb_dir(kind, new)
    if dest.is_file():
        dest.unlink(missing_ok=True)
    if dest.is_dir():
        for child in list(src.iterdir()):
            relocate(child, dest / child.name)
        prune_empty(src, THUMBS / kind)
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    relocate(src, dest)
    prune_empty(src.parent, THUMBS / kind)














