from __future__ import annotations

from pathlib import Path
from typing import Any

from blombo import comfy, hashes, model_meta
from blombo import wildcards as wildcard_meta
from blombo.paths import models_root, wildcards_root

KINDS = {
    "checkpoints": (".safetensors", ".ckpt", ".pt", ".pth", ".sft"),
    "loras": (".safetensors", ".ckpt", ".pt", ".pth"),
    "vae": (".safetensors", ".ckpt", ".pt", ".pth"),
    "controlnet": (".safetensors", ".ckpt", ".pt", ".pth", ".bin"),
    "embeddings": (".safetensors", ".pt", ".bin", ".pth"),
}

WILDCARD_EXTS = (".txt", ".yaml", ".yml")
ALL_KINDS = frozenset((*KINDS, "wildcards"))
HASH_KINDS = ("checkpoints", "loras")


def list_models() -> dict[str, list[dict[str, Any]]]:
    root = models_root()
    data = {kind: _scan(kind, root / kind, exts) for kind, exts in KINDS.items()}
    data["wildcards"] = _scan("wildcards", wildcards_root(), WILDCARD_EXTS)
    return data


def list_kind(kind: str) -> list[dict[str, Any]]:
    if kind == "wildcards":
        return _scan("wildcards", wildcards_root(), WILDCARD_EXTS)
    return _scan(kind, models_root() / kind, KINDS[kind])


def refresh_models(kind: str | None = None) -> dict[str, list[dict[str, Any]]]:
    comfy.warmup_model_lists(kind)
    data = {kind: list_kind(kind)} if kind else list_models()
    hashes.warm(hash_files())
    return data


def hash_files() -> list[Path]:
    root = models_root()
    items: list[Path] = []
    for kind in HASH_KINDS:
        items.extend(_iter_files(root / kind, KINDS[kind]))
    return items


def all_files() -> list[Path]:
    items: list[Path] = []
    root = models_root()
    for kind, exts in KINDS.items():
        items.extend(_iter_files(root / kind, exts))
    items.extend(_iter_files(wildcards_root(), WILDCARD_EXTS))
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


def _scan(kind: str, folder: Path, exts: tuple[str, ...]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    files: list[str] = []
    claimed: dict[str, str] = {}
    paths = _iter_files(folder, exts)
    if kind == "wildcards":
        paths.sort(key=lambda path: (path.relative_to(folder).as_posix().count("/"), path.relative_to(folder).as_posix().lower()))
    for path in paths:
        try:
            added, edited = _times(path)
            size = path.stat().st_size
        except OSError:
            continue
        posix = path.relative_to(folder).as_posix()
        files.append(posix)
        if kind == "wildcards":
            txt = path.suffix.lower() == ".txt"
            for tile in wildcard_meta.iter_tiles(path, posix, claimed):
                tag = str(tile.get("tag") or "")
                if not tag:
                    continue
                source = str(tile.get("source") or posix)
                items.append(
                    {
                        "path": posix if txt else f"{posix}#{tag}",
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
                "path": posix,
                "added": added,
                "edited": edited,
                "size": size,
            }
        )
    model_meta.reconcile(kind, files)
    stamps = model_meta.user_stamps(kind)
    info = model_meta.all_info(kind)
    for item in items:
        rel = str(item.get("source") or item["path"])
        thumb = model_meta.thumb_mtime(kind, rel)
        item["thumb"] = thumb
        item["edited"] = max(int(item["edited"]), thumb, stamps.get(rel, 0))
        row = info.get(rel) or {}
        item["prompt"] = str(row.get("prompt") or "")
        item["negative_prompt"] = str(row.get("negative_prompt") or "")
    items.sort(key=lambda item: str(item.get("tag") or item["path"]).lower())
    return items


def kind_root(kind: str) -> Path:
    if kind == "wildcards":
        return wildcards_root()
    return models_root() / kind


def model_file(kind: str, rel: str) -> Path | None:
    name = str(rel or "").replace("\\", "/").strip().lstrip("/")
    if not name or ".." in Path(name).parts:
        return None
    path = kind_root(kind) / name
    return path if path.is_file() else None


def model_info(kind: str, rel: str) -> dict | None:
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
        "type_options": list(model_meta.OPTIONS),
        "thumb": model_meta.thumb_mtime(kind, posix),
    }
