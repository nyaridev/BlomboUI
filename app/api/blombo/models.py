from __future__ import annotations

from pathlib import Path

from blombo import comfy
from blombo.paths import models_root, wildcards_root

KINDS = {
    "checkpoints": (".safetensors", ".ckpt", ".pt", ".pth", ".sft"),
    "loras": (".safetensors", ".ckpt", ".pt", ".pth"),
    "vae": (".safetensors", ".ckpt", ".pt", ".pth"),
    "controlnet": (".safetensors", ".ckpt", ".pt", ".pth", ".bin"),
    "embeddings": (".safetensors", ".pt", ".bin", ".pth"),
}

WILDCARD_EXTS = (".txt", ".yaml", ".yml")


def list_models() -> dict[str, list[str]]:
    root = models_root()
    data = {kind: _scan(root / kind, exts) for kind, exts in KINDS.items()}
    data["wildcards"] = _scan(wildcards_root(), WILDCARD_EXTS)
    return data


def refresh_models() -> dict[str, list[str]]:
    comfy.warmup_model_lists()
    return list_models()


def _scan(folder: Path, exts: tuple[str, ...]) -> list[str]:
    if not folder.is_dir():
        return []
    items: list[str] = []
    for path in folder.rglob("*"):
        if not path.is_file() or path.name in {".gitkeep", "desktop.ini"}:
            continue
        if path.suffix.lower() not in exts:
            continue
        items.append(path.relative_to(folder).as_posix())
    items.sort(key=str.lower)
    return items
