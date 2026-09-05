from __future__ import annotations

import json
import math
import shutil
from pathlib import Path
from typing import Any, Iterator

from features.models.scripts.model_thumb_storage import load_index, prune_empty, relocate, set_index, write_index

FILES: Path | None = None
JSON_NAME = "model_data.json"
DATA_SUFFIX = "_data"
GLOBAL = "global"


def split_ident(ident: str) -> tuple[str, str]:
    text = str(ident or "").replace("\\", "/").strip().lstrip("/")
    file_ident, sep, tile = text.partition("#")
    return file_ident, tile if sep else ""


def model_path(kind: str, ident: str) -> Path | None:
    file_ident, _ = split_ident(ident)
    if not file_ident or ".." in Path(file_ident).parts:
        return None
    override = globals().get("FILES")
    if isinstance(override, Path):
        return override / kind / file_ident
    from features.models.scripts import models as models_mod

    return models_mod.model_path(kind, file_ident)


def is_data_name(name: str) -> bool:
    return str(name or "").endswith(DATA_SUFFIX)


def dir_for_file(path: Path) -> Path:
    parent = path.parent
    preferred = parent / f"{path.stem}{DATA_SUFFIX}"
    alt = parent / f"{path.name}{DATA_SUFFIX}"
    if alt.is_dir() and not preferred.is_dir():
        return alt
    try:
        clash = any(item.is_file() and item.stem == path.stem and item.name != path.name for item in parent.iterdir())
    except OSError:
        clash = False
    return alt if clash else preferred


def data_dir(kind: str, ident: str) -> Path | None:
    path = model_path(kind, ident)
    return dir_for_file(path) if path is not None else None


def thumbs_dir(kind: str, ident: str) -> Path | None:
    folder = data_dir(kind, ident)
    if folder is None:
        return None
    _, tile = split_ident(ident)
    if tile:
        return folder / "thumbs" / "tiles" / _safe_tile(tile)
    return folder / "thumbs"


def json_path(kind: str, ident: str) -> Path | None:
    folder = data_dir(kind, ident)
    return folder / JSON_NAME if folder is not None else None


def load(kind: str, ident: str) -> dict[str, Any]:
    path = json_path(kind, ident)
    if path is None or not path.is_file():
        return _blank()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _blank()
    return raw if isinstance(raw, dict) else _blank()


def dump(kind: str, ident: str, data: dict[str, Any]) -> None:
    path = json_path(kind, ident)
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _clean_doc(data)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_info(kind: str, ident: str, row: dict[str, Any]) -> None:
    path = model_path(kind, ident)
    if path is None:
        return
    override = globals().get("FILES")
    if not isinstance(override, Path) and not path.is_file():
        return
    doc = load(kind, ident)
    doc["info"] = _info_payload(row)
    dump(kind, ident, doc)
    prune(kind, ident)


def record_thumb(kind: str, ident: str, context: str, file: str, raw: str, tags: list[Any]) -> None:
    if not file:
        return
    doc = load(kind, ident)
    block = _thumbs_block(doc, ident)
    cleaned = [str(tag).strip() for tag in tags if str(tag).strip()]
    raw_name = str(raw or "") or None
    if context == GLOBAL:
        block["global"] = {"file": file, "raw": raw_name, "tags": cleaned}
    else:
        contexts = [item for item in block.get("contexts") or [] if isinstance(item, dict) and item.get("file") != file]
        contexts.append(
            {
                "file": file,
                "raw": raw_name,
                "tags": cleaned,
                "scopes": _scope_snapshots(context),
            }
        )
        block["contexts"] = contexts
    dump(kind, ident, doc)


def clear_thumb(kind: str, ident: str, context: str | None = None, all_contexts: bool = False) -> None:
    doc = load(kind, ident)
    file_ident, tile = split_ident(ident)
    if all_contexts:
        if tile:
            tiles = doc.get("tiles") if isinstance(doc.get("tiles"), dict) else {}
            tiles.pop(tile, None)
            doc["tiles"] = tiles
        else:
            doc["thumbs"] = {}
            doc["tiles"] = {}
        dump(kind, ident, doc)
        prune(kind, ident)
        return
    block = _thumbs_block(doc, ident)
    key = str(context or GLOBAL)
    if key == GLOBAL:
        block.pop("global", None)
    else:
        block["contexts"] = [
            item
            for item in block.get("contexts") or []
            if isinstance(item, dict) and not _entry_matches(item, key)
        ]
    dump(kind, ident, doc)
    prune(kind, ident)


def prune(kind: str, ident: str) -> None:
    folder = data_dir(kind, ident)
    if folder is None or not folder.exists():
        return
    doc = load(kind, ident)
    thumbs = folder / "thumbs"
    if thumbs.is_dir():
        prune_empty(thumbs / "tiles", thumbs)
        try:
            next(thumbs.rglob("*"))
        except StopIteration:
            shutil.rmtree(thumbs, ignore_errors=True)
        except OSError:
            pass
    if not _info_blank(doc.get("info")):
        return
    if not _thumbs_blank(doc.get("thumbs")):
        return
    tiles = doc.get("tiles")
    if isinstance(tiles, dict) and tiles:
        return
    path = folder / JSON_NAME
    path.unlink(missing_ok=True)
    shutil.rmtree(folder, ignore_errors=True)


def relocate_sidecar(src: Path, dest: Path) -> None:
    old = dir_for_file(src)
    if not old.exists():
        return
    relocate(old, dir_for_file(dest))


def restore_all() -> dict[str, int]:
    models = 0
    thumbs = 0
    created = 0
    seen: set[tuple[str, str]] = set()
    for kind, ident, _path in iter_present():
        key = (kind, split_ident(ident)[0])
        if key in seen:
            continue
        folder = data_dir(kind, ident)
        if folder is None:
            continue
        if not (folder / JSON_NAME).is_file() and not (folder / "thumbs").is_dir():
            continue
        seen.add(key)
        added, extra = hydrate(kind, ident)
        models += 1
        thumbs += added
        created += extra
    return {"models": models, "thumbs": thumbs, "scopesCreated": created}


def hydrate(kind: str, ident: str) -> tuple[int, int]:
    doc = load(kind, ident)
    file_ident, _ = split_ident(ident)
    info = doc.get("info") if isinstance(doc.get("info"), dict) else {}
    if info and not _info_blank(info):
        _apply_info_cache(kind, file_ident, info)
    count, created = _index_thumbs(kind, file_ident, doc.get("thumbs"))
    tiles = doc.get("tiles") if isinstance(doc.get("tiles"), dict) else {}
    for tag, row in tiles.items():
        thumbs = row.get("thumbs") if isinstance(row, dict) else None
        added, extra = _index_thumbs(kind, f"{file_ident}#{tag}", thumbs)
        count += added
        created += extra
    return count, created


def rebuild_index() -> None:
    data: dict[str, Any] = {}
    seen: set[tuple[str, str]] = set()

    def add(kind: str, ident: str) -> None:
        file_ident, _ = split_ident(ident)
        key = (kind, file_ident)
        if key in seen:
            return
        seen.add(key)
        doc = load(kind, file_ident)
        _fill_index(data, kind, file_ident, doc.get("thumbs"))
        tiles = doc.get("tiles") if isinstance(doc.get("tiles"), dict) else {}
        for tag, row in tiles.items():
            thumbs = row.get("thumbs") if isinstance(row, dict) else None
            _fill_index(data, kind, f"{file_ident}#{tag}", thumbs)

    for kind, ident, _path in iter_present():
        add(kind, ident)
    for kind, rows in load_index().items():
        if not isinstance(rows, dict):
            continue
        for ident in rows:
            add(str(kind), str(ident))
    write_index(data)


def iter_present() -> Iterator[tuple[str, str, Path]]:
    from features.models.scripts import models as models_mod
    from shared import dirs

    override = globals().get("FILES")
    if isinstance(override, Path):
        for kind in models_mod.ALL_KINDS:
            exts = models_mod.WILDCARD_EXTS if kind == "wildcards" else models_mod.KINDS.get(kind, ())
            yield from _iter_folder(kind, override / kind, exts, "")
        return
    yield from _iter_folder("wildcards", models_mod.kind_root("wildcards"), models_mod.WILDCARD_EXTS, "")
    for name, folder in dirs.extra_named("wildcardDirs").items():
        yield from _iter_folder("wildcards", folder, models_mod.WILDCARD_EXTS, name)
    for kind, exts in models_mod.KINDS.items():
        yield from _iter_folder(kind, models_mod.kind_root(kind), exts, "")
        for name, folder in dirs.extra_named("modelDirs").items():
            yield from _iter_folder(kind, folder / kind, exts, name)


def _iter_folder(kind: str, folder: Path, exts: tuple[str, ...], prefix: str) -> Iterator[tuple[str, str, Path]]:
    if not folder.is_dir():
        return
    for path in folder.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in exts:
            continue
        if any(part.endswith(DATA_SUFFIX) for part in path.parts):
            continue
        try:
            posix = path.relative_to(folder).as_posix()
        except ValueError:
            continue
        rel = f"{prefix}/{posix}" if prefix else posix
        yield kind, rel, path


def _apply_info_cache(kind: str, ident: str, info: dict[str, Any]) -> None:
    from features.models.scripts import model_meta

    model_meta.apply_cache(kind, ident, info)


def _index_thumbs(kind: str, ident: str, thumbs: Any) -> tuple[int, int]:
    from features.models.scripts import thumbnail_scopes

    if not isinstance(thumbs, dict):
        return 0, 0
    folder = thumbs_dir(kind, ident)
    count = 0
    created = 0
    global_row = thumbs.get("global")
    if isinstance(global_row, dict) and global_row.get("file"):
        _index_row(kind, ident, GLOBAL, global_row, folder)
        count += 1
    for entry in thumbs.get("contexts") or []:
        if not isinstance(entry, dict) or not entry.get("file"):
            continue
        ids: list[str] = []
        for snap in entry.get("scopes") or []:
            if not isinstance(snap, dict):
                continue
            row, extra = thumbnail_scopes.ensure_scope(snap)
            created += int(extra)
            if row and row.get("id") and row["id"] != GLOBAL:
                ids.append(str(row["id"]))
        key = thumbnail_scopes.context_key(ids)
        _index_row(kind, ident, key, entry, folder)
        count += 1
    return count, created


def _fill_index(data: dict[str, Any], kind: str, ident: str, thumbs: Any) -> None:
    from features.models.scripts import thumbnail_scopes

    if not isinstance(thumbs, dict):
        return
    folder = thumbs_dir(kind, ident)
    rows = data.setdefault(kind, {})
    item = rows.setdefault(ident, {})
    global_row = thumbs.get("global")
    if isinstance(global_row, dict) and global_row.get("file"):
        item[GLOBAL] = _index_payload(global_row, folder)
    for entry in thumbs.get("contexts") or []:
        if not isinstance(entry, dict) or not entry.get("file"):
            continue
        ids = []
        for snap in entry.get("scopes") or []:
            if isinstance(snap, dict) and snap.get("id"):
                ids.append(str(snap["id"]))
        key = thumbnail_scopes.context_key(ids) if ids else GLOBAL
        item[key] = _index_payload(entry, folder)


def _index_row(kind: str, ident: str, context: str, row: dict[str, Any], folder: Path | None) -> None:
    payload = _index_payload(row, folder)
    set_index(kind, ident, context, payload["mtime"], payload["tags"], payload["file"], payload["raw"])


def _index_payload(row: dict[str, Any], folder: Path | None) -> dict[str, Any]:
    name = str(row.get("file") or "")
    raw = str(row.get("raw") or "")
    path = folder / name if folder is not None and name else None
    mtime = 0
    if path is not None and path.is_file():
        try:
            mtime = int(path.stat().st_mtime)
        except OSError:
            mtime = 0
    tags = row.get("tags") if isinstance(row.get("tags"), list) else []
    return {
        "mtime": mtime,
        "tags": [str(tag) for tag in tags if str(tag).strip()],
        "file": name,
        "raw": raw,
    }


def _thumbs_block(doc: dict[str, Any], ident: str) -> dict[str, Any]:
    _, tile = split_ident(ident)
    if not tile:
        block = doc.get("thumbs")
        if not isinstance(block, dict):
            block = {}
            doc["thumbs"] = block
        return block
    tiles = doc.get("tiles")
    if not isinstance(tiles, dict):
        tiles = {}
        doc["tiles"] = tiles
    row = tiles.get(tile)
    if not isinstance(row, dict):
        row = {}
        tiles[tile] = row
    block = row.get("thumbs")
    if not isinstance(block, dict):
        block = {}
        row["thumbs"] = block
    return block


def _scope_snapshots(context: str) -> list[dict[str, Any]]:
    from features.models.scripts import thumbnail_scopes

    out: list[dict[str, Any]] = []
    for ident in thumbnail_scopes.parse_context(context):
        if ident == thumbnail_scopes.GLOBAL_ID:
            continue
        row = thumbnail_scopes.get_scope(ident)
        if not row:
            continue
        out.append(
            {
                "id": row["id"],
                "name": row["name"],
                "group": row.get("group") or "",
                "anyGroups": list(row.get("anyGroups") or []),
                "exclude": list(row.get("exclude") or []),
                "priority": int(row.get("priority") or 0),
            }
        )
    return out


def _entry_matches(entry: dict[str, Any], context: str) -> bool:
    from features.models.scripts import thumbnail_scopes

    ids = [str(item.get("id") or "") for item in entry.get("scopes") or [] if isinstance(item, dict)]
    return thumbnail_scopes.context_key(ids) == context


def _safe_tile(tag: str) -> str:
    text = str(tag or "").strip().replace("\\", "_").replace("/", "_")
    return text.replace("..", "_") or "_"


def _blank() -> dict[str, Any]:
    return {"v": 1, "info": _blank_info(), "thumbs": {}, "tiles": {}}


def _blank_info() -> dict[str, Any]:
    return {
        "types": [],
        "notes": "",
        "prompt": "",
        "negative_prompt": "",
        "strength": 1.0,
        "slider": False,
        "auto_apply": None,
        "apply_at": None,
    }


def _info_payload(row: dict[str, Any]) -> dict[str, Any]:
    strength = row.get("strength")
    try:
        value = float(strength)
    except (TypeError, ValueError):
        value = 1.0
    if not math.isfinite(value):
        value = 1.0
    return {
        "types": list(row.get("types") or []),
        "notes": str(row.get("notes") or ""),
        "prompt": str(row.get("prompt") or ""),
        "negative_prompt": str(row.get("negative_prompt") or ""),
        "strength": value,
        "slider": bool(row.get("slider")),
        "auto_apply": row.get("auto_apply") if isinstance(row.get("auto_apply"), bool) else None,
        "apply_at": row.get("apply_at") if row.get("apply_at") in {"start", "end"} else None,
    }


def _info_blank(raw: Any) -> bool:
    if not isinstance(raw, dict):
        return True
    info = _info_payload(raw)
    return (
        not info["types"]
        and not info["notes"]
        and not info["prompt"]
        and not info["negative_prompt"]
        and info["strength"] == 1.0
        and not info["slider"]
        and info["auto_apply"] is None
        and info["apply_at"] is None
    )


def _thumbs_blank(raw: Any) -> bool:
    if not isinstance(raw, dict):
        return True
    if isinstance(raw.get("global"), dict) and raw["global"].get("file"):
        return False
    contexts = raw.get("contexts")
    return not isinstance(contexts, list) or not any(isinstance(item, dict) and item.get("file") for item in contexts)


def _clean_doc(data: dict[str, Any]) -> dict[str, Any]:
    info = data.get("info") if isinstance(data.get("info"), dict) else {}
    thumbs = data.get("thumbs") if isinstance(data.get("thumbs"), dict) else {}
    tiles = data.get("tiles") if isinstance(data.get("tiles"), dict) else {}
    return {"v": 1, "info": _info_payload(info), "thumbs": thumbs, "tiles": tiles}
