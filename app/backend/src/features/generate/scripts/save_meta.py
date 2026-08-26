from __future__ import annotations

from pathlib import Path
from typing import Any

from features.models.scripts import hashes
from features.models.scripts import models

VERSION = 2
HASH_KEYS = ("autov1", "autov2", "autov3", "sha256")
PARAM_FIELDS = (
    "prompt",
    "negative_prompt",
    "prompt_raw",
    "negative_prompt_raw",
    "steps",
    "cfg",
    "seed",
    "sampler",
    "scheduler",
    "width",
    "height",
    "models",
)
_LOADERS: dict[str, tuple[str, tuple[str, ...]]] = {
    "CheckpointLoaderSimple": ("checkpoints", ("ckpt_name",)),
    "CheckpointLoader": ("checkpoints", ("ckpt_name",)),
    "ImageOnlyCheckpointLoader": ("checkpoints", ("ckpt_name",)),
    "UNETLoader": ("diffusion_models", ("unet_name",)),
    "VAELoader": ("vae", ("vae_name",)),
    "CLIPLoader": ("text_encoders", ("clip_name",)),
    "DualCLIPLoader": ("text_encoders", ("clip_name1", "clip_name2")),
    "TripleCLIPLoader": ("text_encoders", ("clip_name1", "clip_name2", "clip_name3")),
    "LoraLoader": ("loras", ("lora_name",)),
    "LoraLoaderModelOnly": ("loras", ("lora_name",)),
    "ControlNetLoader": ("controlnet", ("control_net_name",)),
}


def valid_params(params: Any) -> bool:
    if not isinstance(params, dict):
        return False
    if "prompt" not in params or "prompt_raw" not in params:
        return False
    return isinstance(params.get("models"), list)


def valid_meta(meta: Any) -> bool:
    return isinstance(meta, dict) and meta.get("version") == VERSION and valid_params(meta.get("params"))


def take_params(raw: Any) -> dict[str, Any] | None:
    if not valid_params(raw):
        return None
    out = {key: raw[key] for key in PARAM_FIELDS if key in raw}
    if raw.get("interrupted"):
        out["interrupted"] = True
    return out


def pack_params(values: dict[str, Any], graph: dict[str, Any] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
        "prompt_raw": str(values.get("prompt_raw") if values.get("prompt_raw") is not None else values.get("prompt") or ""),
        "negative_prompt_raw": str(
            values.get("negative_prompt_raw")
            if values.get("negative_prompt_raw") is not None
            else values.get("negative_prompt") or ""
        ),
        "steps": values.get("steps"),
        "cfg": values.get("cfg"),
        "seed": values.get("seed"),
        "sampler": str(values.get("sampler") or ""),
        "scheduler": str(values.get("scheduler") or ""),
        "width": values.get("width"),
        "height": values.get("height"),
        "models": collect_models(values, graph),
    }
    if values.get("interrupted"):
        out["interrupted"] = True
    return out


def envelope(
    job_id: str,
    values: dict[str, Any],
    packed: dict[str, Any],
    kind: str,
    created_at: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template_params = values.get("template_params")
    meta: dict[str, Any] = {
        "version": VERSION,
        "asset_kind": kind,
        "created_at": created_at,
        "job_id": job_id,
        "workflow_id": str(values.get("workflow_id") or values.get("workflow") or ""),
        "template_id": str(values.get("template_id") or ""),
        "template_name": str(values.get("template_name") or values.get("template") or ""),
        "template_params": template_params if isinstance(template_params, dict) else {},
        "params": packed,
    }
    if extra:
        meta.update(extra)
    return meta


def collect_models(values: dict[str, Any], graph: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(kind: str, row: dict[str, str], strength: float | None = None) -> None:
        if not row:
            return
        key = row.get("sha256") or row.get("autov2") or ""
        if not key or key in seen:
            return
        seen.add(key)
        item: dict[str, Any] = {"kind": kind, "hashes": row}
        if strength is not None:
            item["strength"] = strength
        out.append(item)

    ckpt = str(values.get("checkpoint") or "")
    kind, row = _hash_named(ckpt, ("checkpoints", "diffusion_models"))
    add(kind or "checkpoints", row)
    add("vae", _hashes_for("vae", str(values.get("vae") or "")))
    add("text_encoders", _hashes_for("text_encoders", str(values.get("text_encoder") or "")))
    rows = values.get("loras")
    if isinstance(rows, list):
        for item in rows:
            name, strength = _lora_ref(item)
            add("loras", _hashes_for("loras", name), strength)
    if isinstance(graph, dict):
        for node in graph.values():
            if not isinstance(node, dict):
                continue
            cls = str(node.get("class_type") or "")
            inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
            if cls == "Power Lora Loader (rgthree)":
                for value in inputs.values():
                    if not isinstance(value, dict) or not value.get("on", True):
                        continue
                    add("loras", _hashes_for("loras", str(value.get("lora") or "")), _num(value.get("strength"), 1.0))
                continue
            spec = _LOADERS.get(cls)
            if not spec:
                continue
            kind, keys = spec
            for key in keys:
                add(kind, _hashes_for(kind, str(inputs.get(key) or "")))
    return out


def checkpoint_hashes(params: dict[str, Any]) -> dict[str, str]:
    for item in params.get("models") or []:
        if not isinstance(item, dict):
            continue
        if item.get("kind") in {"checkpoints", "diffusion_models", "checkpoint"}:
            row = item.get("hashes")
            return dict(row) if isinstance(row, dict) else {}
    return {}


def lora_models(params: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in params.get("models") or []:
        if not isinstance(item, dict) or item.get("kind") != "loras":
            continue
        out.append(item)
    return out


def _hashes_for(kind: str, rel: str) -> dict[str, str]:
    name = str(rel or "").replace("\\", "/").strip()
    if not name or kind == "wildcards":
        return {}
    path = models.model_file(kind, name)
    if not path:
        return {}
    row = hashes.entry(path) or {}
    if not row:
        hashes.request(path, urgent=True)
        return {}
    return {key: str(row[key]) for key in HASH_KEYS if row.get(key)}


def _hash_named(rel: str, kinds: tuple[str, ...]) -> tuple[str, dict[str, str]]:
    for kind in kinds:
        row = _hashes_for(kind, rel)
        if row:
            return kind, row
    return "", {}


def _lora_ref(item: Any) -> tuple[str, float]:
    if isinstance(item, str):
        return item.strip(), 1.0
    if not isinstance(item, dict):
        return "", 1.0
    name = str(item.get("lora") or item.get("path") or "").strip()
    return name, _num(item.get("strength"), 1.0)


def _num(value: Any, fallback: float) -> float:
    try:
        number = float(value if value is not None else fallback)
    except (TypeError, ValueError):
        return fallback
    return number


def rel_for_hashes(kind: str, row: Any) -> str:
    wanted = {str(row.get(key) or "").lower() for key in HASH_KEYS} if isinstance(row, dict) else set()
    wanted.discard("")
    if not wanted:
        return ""
    path = hashes.find_path(wanted)
    if path is None:
        return str((row or {}).get("autov2") or (row or {}).get("sha256") or "")
    rel = _rel_under_kind(kind, path)
    return rel or str(row.get("autov2") or row.get("sha256") or "")


def _rel_under_kind(kind: str, path: Path) -> str:
    try:
        resolved = path.resolve()
    except OSError:
        return ""
    from shared import dirs
    from config import models_root

    roots: list[tuple[str, Path]] = [("", models_root() / kind)]
    for name, folder in dirs.extra_named("modelDirs").items():
        roots.append((name, folder / kind))
    for prefix, root in roots:
        try:
            rel = resolved.relative_to(root.resolve()).as_posix()
        except (OSError, ValueError):
            continue
        if not rel or rel.startswith(".."):
            continue
        return f"{prefix}/{rel}" if prefix else rel
    return ""
