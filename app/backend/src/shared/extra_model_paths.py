from __future__ import annotations

from pathlib import Path

MODEL_SUBDIRS = (
    "checkpoints",
    "loras",
    "vae",
    "controlnet",
    "embeddings",
    "text_encoders",
    "diffusion_models",
    "upscale_models",
    "SEEDVR2",
    "sams",
    "ultralytics",
    "vae_approx",
    "clip_vision",
    "hypernetworks",
    "photomaker",
    "gligen",
    "diffusers",
    "classifiers",
)


def yaml_ident(name: str) -> str:
    ident = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name).strip("._-")
    return ident or "extra"


def yaml_block(ident: str, root: Path) -> list[str]:
    models = str(root.resolve()).replace("\\", "/")
    lines = [
        f"{ident}:",
        f"    base_path: '{models}'",
    ]
    lines.extend(f"    {name}: {name}" for name in MODEL_SUBDIRS)
    lines.append("")
    return lines


def write_file(dest: Path, named_roots: list[tuple[str, Path]]) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for ident, root in named_roots:
        lines.extend(yaml_block(yaml_ident(ident), root))
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return dest
