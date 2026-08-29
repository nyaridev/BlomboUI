from __future__ import annotations

from pathlib import Path
from typing import Any

from shared import dirs
from infrastructure.comfy import client as comfy
from features.models.scripts import hashes
from features.models.scripts import model_meta
from features.models.scripts import model_thumbs
from features.wildcards.scripts import wildcards as wildcard_meta
from config import models_root, wildcards_root

KINDS = {
    "checkpoints": (".safetensors", ".ckpt", ".pt", ".pth", ".sft"),
    "loras": (".safetensors", ".ckpt", ".pt", ".pth"),
    "vae": (".safetensors", ".ckpt", ".pt", ".pth"),
    "controlnet": (".safetensors", ".ckpt", ".pt", ".pth", ".bin"),
    "embeddings": (".safetensors", ".pt", ".bin", ".pth"),
    "diffusion_models": (".safetensors", ".ckpt", ".pt", ".pth", ".sft", ".gguf"),
    "text_encoders": (".safetensors", ".ckpt", ".pt", ".pth", ".sft", ".bin", ".gguf"),
    "upscale_models": (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".onnx"),
    "sams": (".pt", ".pth"),
    "ultralytics": (".pt", ".pth", ".onnx"),
}

WILDCARD_EXTS = (".txt", ".yaml", ".yml")
ALL_KINDS = frozenset((*KINDS, "wildcards"))
HASH_KINDS = ("checkpoints", "loras", "diffusion_models")


def list_models(
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    data = {kind: list_kind(kind, context, mode, fallback, optional) for kind in KINDS}
    data["wildcards"] = list_kind("wildcards", context, mode, fallback, optional)
    return data


def list_kind(
    kind: str,
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    files: list[str] = []
    if kind == "wildcards":
        local, local_files = _scan_folder(kind, wildcards_root(), WILDCARD_EXTS, "")
        items.extend(local)
        files.extend(local_files)
        for name, folder in dirs.extra_named("wildcardDirs").items():
            extra, extra_files = _scan_folder(kind, folder, WILDCARD_EXTS, name)
            items.extend(extra)
            files.extend(extra_files)
    else:
        exts = KINDS[kind]
        local, local_files = _scan_folder(kind, models_root() / kind, exts, "")
        items.extend(local)
        files.extend(local_files)
        for name, folder in dirs.extra_named("modelDirs").items():
            extra, extra_files = _scan_folder(kind, folder / kind, exts, name)
            items.extend(extra)
            files.extend(extra_files)
    model_meta.reconcile(kind, files)
    stamps = model_meta.user_stamps(kind)
    info = model_meta.all_info(kind)
    for item in items:
        tile = str(item["path"])
        rel = str(item.get("source") or tile).split("#", 1)[0]
        file_path = model_file(kind, tile)
        thumb_path = model_thumbs.resolved_file(kind, tile, context, mode, fallback, optional)
        thumb = model_thumbs.resolved_mtime(kind, tile, context, mode, fallback, optional)
        global_path = model_thumbs.thumb_at(kind, tile, model_thumbs.GLOBAL)
        exact_path = model_thumbs.thumb_at(kind, tile, context)
        item["thumb"] = thumb
        item["thumb_media"] = model_thumbs.thumb_media(thumb_path) if thumb_path else ""
        item["thumb_global"] = model_thumbs.thumb_mtime(kind, tile, model_thumbs.GLOBAL)
        item["thumb_global_media"] = model_thumbs.thumb_media(global_path) if global_path else ""
        item["thumb_exact"] = model_thumbs.thumb_mtime(kind, tile, context)
        item["thumb_exact_media"] = model_thumbs.thumb_media(exact_path) if exact_path else ""
        item["thumb_any"] = model_thumbs.thumb_any_mtime(kind, tile)
        if file_path is not None and kind != "wildcards":
            item["hashes"] = hashes.entry(file_path) or {}
        item["edited"] = max(int(item["edited"]), thumb, item["thumb_global"], item["thumb_any"], stamps.get(rel, 0))
        row = info.get(rel) or {}
        item["prompt"] = str(row.get("prompt") or "")
        item["negative_prompt"] = str(row.get("negative_prompt") or "")
        item["notes"] = str(row.get("notes") or "")
        item["strength"] = float(row["strength"]) if "strength" in row else 1.0
        item["slider"] = bool(row.get("slider"))
        item["auto_apply"] = row.get("auto_apply") if isinstance(row.get("auto_apply"), bool) else None
        item["apply_at"] = row.get("apply_at") if row.get("apply_at") in {"start", "end"} else None
        item["types"] = list(row.get("types") or [])
    items.sort(key=lambda item: str(item.get("tag") or item["path"]).lower())
    return items


def refresh_models(
    kind: str | None = None,
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    comfy.warmup_model_lists(kind)
    data = {kind: list_kind(kind, context, mode, fallback, optional)} if kind else list_models(context, mode, fallback, optional)
    hashes.warm(hash_files())
    return data


def hash_files() -> list[Path]:
    items: list[Path] = []
    for kind in HASH_KINDS:
        items.extend(_iter_files(models_root() / kind, KINDS[kind]))
        for folder in dirs.extra_named("modelDirs").values():
            items.extend(_iter_files(folder / kind, KINDS[kind]))
    return items


def _times(path: Path) -> tuple[int, int]:
    st = path.stat()
    added = getattr(st, "st_birthtime", None)
    if added is None:
        added = st.st_ctime
    return int(added), int(st.st_mtime)


def _iter_files(folder: Path, exts: tuple[str, ...]) -> list[Path]:
    if not folder.is_dir():
        return []
    items: list[Path] = []
    for path in folder.rglob("*"):
        if not path.is_file() or path.name in {".gitkeep", "desktop.ini"}:
            continue
        if path.suffix.lower() not in exts:
            continue
        items.append(path)
    return items


def _scan_folder(kind: str, folder: Path, exts: tuple[str, ...], prefix: str) -> tuple[list[dict[str, Any]], list[str]]:
    items: list[dict[str, Any]] = []
    files: list[str] = []
    claimed: dict[str, str] = {}
    paths = _iter_files(folder, exts)
    if kind == "wildcards":
        paths.sort(key=lambda path: (path.relative_to(folder).as_posix().count("/"), path.relative_to(folder).as_posix().lower()))

    def tagged(posix: str) -> str:
        return f"{prefix}/{posix}" if prefix else posix

    for path in paths:
        try:
            added, edited = _times(path)
            size = path.stat().st_size
        except OSError:
            continue
        posix = path.relative_to(folder).as_posix()
        rel = tagged(posix)
        files.append(rel)
        if kind == "wildcards":
            txt = path.suffix.lower() == ".txt"
            for tile in wildcard_meta.iter_tiles(path, posix, claimed):
                tag = str(tile.get("tag") or "")
                if not tag:
                    continue
                source = tagged(str(tile.get("source") or posix))
                items.append(
                    {
                        "path": rel if txt else f"{rel}#{tag}",
                        "added": added,
                        "edited": edited,
                        "size": size,
                        "label": tag,
                        "tag": tag,
                        "source": source,
                        "dir": bool(tile.get("dir")),
                    }
                )
            continue
        items.append(
            {
                "path": rel,
                "added": added,
                "edited": edited,
                "size": size,
            }
        )
    return items, files


def kind_root(kind: str) -> Path:
    if kind == "wildcards":
        return wildcards_root()
    return models_root() / kind


def model_file(kind: str, rel: str) -> Path | None:
    name = str(rel or "").replace("\\", "/").strip().lstrip("/").split("#", 1)[0]
    if not name or ".." in Path(name).parts:
        return None
    first, _, rest = name.partition("/")
    extra = dirs.extra_root("wildcardDirs" if kind == "wildcards" else "modelDirs", first)
    if extra is not None:
        path = extra / rest if kind == "wildcards" else extra / kind / rest
        return path if path.is_file() else None
    path = kind_root(kind) / name
    return path if path.is_file() else None


def model_info(
    kind: str,
    rel: str,
    context: str = model_thumbs.GLOBAL,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> dict | None:
    path = model_file(kind, rel)
    if not path:
        return None
    try:
        st = path.stat()
    except OSError:
        return None
    posix = rel.replace("\\", "/").strip().lstrip("/")
    info = model_meta.get_info(kind, posix)
    hashed = kind != "wildcards"
    row = hashes.entry(path) if hashed else None
    if hashed:
        hashes.request(path, urgent=True)
    return {
        "path": posix,
        "name": path.name,
        "size": st.st_size,
        "edited": max(int(st.st_mtime), model_meta.user_mtime(kind, posix)),
        "hash": (row or {}).get("autov2") or "",
        "hashes": row or {"sha256": "", "autov1": "", "autov2": "", "autov3": ""},
        "hashing": hashed and row is None,
        "types": info["types"],
        "prompt": info["prompt"],
        "negative_prompt": info["negative_prompt"],
        "notes": info["notes"],
        "strength": info["strength"],
        "slider": info["slider"],
        "auto_apply": info["auto_apply"],
        "apply_at": info["apply_at"],
        "type_options": list(model_meta.OPTIONS),
        "thumb": model_thumbs.resolved_mtime(kind, posix, context, mode, fallback, optional),
        "thumb_media": _thumb_media(kind, posix, context, mode, fallback, optional),
        "thumb_global": model_thumbs.thumb_mtime(kind, posix, model_thumbs.GLOBAL),
        "thumb_global_media": _thumb_media(kind, posix, model_thumbs.GLOBAL),
        "thumb_exact": model_thumbs.thumb_mtime(kind, posix, context),
        "thumb_exact_media": _thumb_media(kind, posix, context),
    }


def _thumb_media(
    kind: str,
    path: str,
    context: str,
    mode: str = "exact",
    fallback: bool = False,
    optional: list[str] | None = None,
) -> str:
    file = model_thumbs.resolved_file(kind, path, context, mode, fallback, optional)
    return model_thumbs.thumb_media(file) if file else ""
