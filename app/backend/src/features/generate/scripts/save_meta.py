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
    "clip_skip",
    "clip_type",
    "clip_device",
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
    "UnetLoaderGGUF": ("diffusion_models", ("unet_name",)),
    "VAELoader": ("vae", ("vae_name",)),
    "CLIPLoader": ("text_encoders", ("clip_name",)),
    "CLIPLoaderGGUF": ("text_encoders", ("clip_name",)),
    "DualCLIPLoader": ("text_encoders", ("clip_name1", "clip_name2")),
    "DualCLIPLoaderGGUF": ("text_encoders", ("clip_name1", "clip_name2")),
    "TripleCLIPLoader": ("text_encoders", ("clip_name1", "clip_name2", "clip_name3")),
    "TripleCLIPLoaderGGUF": ("text_encoders", ("clip_name1", "clip_name2", "clip_name3")),
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
    hires = raw.get("hires")
    if isinstance(hires, dict):
        out["hires"] = hires
    adetailer = raw.get("adetailer")
    if isinstance(adetailer, dict):
        out["adetailer"] = adetailer
    return out


def pack_params(values: dict[str, Any], graph: dict[str, Any] | None = None, kind: str = "") -> dict[str, Any]:
    from features.generate.scripts.workflow.attention import attention_meta, stage_attention
    from features.generate.scripts.workflow.comfy_fill import adetailer_enabled
    from features.generate.scripts.workflow.compose import hires_enabled

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
        "clip_skip": values.get("clip_skip"),
        "clip_type": values.get("clip_type") or values.get("clipType"),
        "clip_device": values.get("clip_device") or values.get("clipDevice"),
        "seed": values.get("seed"),
        "sampler": str(values.get("sampler") or ""),
        "scheduler": str(values.get("scheduler") or ""),
        "width": values.get("width"),
        "height": values.get("height"),
        "models": collect_models(values, graph),
    }
    attn = stage_attention(values, "first")
    if attn:
        out["attention"] = attention_meta(attn)
    if values.get("interrupted"):
        out["interrupted"] = True
    if kind == "hires" and hires_enabled(values):
        out["hires"] = pack_hires(values)
    if adetailer_enabled(values) and not (hires_enabled(values) and kind == "images"):
        out["adetailer"] = pack_adetailer(values)
    return out


def pack_hires(values: dict[str, Any]) -> dict[str, Any]:
    from features.generate.scripts.workflow.comfy_fill import _hires_kind_diffusion, hires_meta_fields
    from features.generate.scripts.workflow.compose import _flag, _hires_blob

    out = hires_meta_fields(values)
    blob = _hires_blob(values)
    models: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(kind: str, rel: str, strength: float | None = None) -> None:
        name = str(rel or "").replace("\\", "/").strip()
        _push_model(models, seen, kind, name, _hashes_for(kind, name), strength)

    add("upscale_models", str(blob.get("upscale_model") or blob.get("upscaleModel") or ""))
    if _flag(blob, "model_override", "modelOverride"):
        ckpt = str(blob.get("checkpoint") or "")
        if _hires_kind_diffusion(blob):
            add("diffusion_models", ckpt)
        else:
            kind, row = _hash_named(ckpt, ("checkpoints", "diffusion_models"))
            _push_model(models, seen, kind or "checkpoints", ckpt, row)
        add("vae", str(blob.get("vae") or ""))
        add("text_encoders", str(blob.get("text_encoder") or blob.get("textEncoder") or ""))
    if _flag(blob, "lora_override", "loraOverride"):
        rows = blob.get("loras")
        if isinstance(rows, list):
            for item in rows:
                name, strength = _lora_ref(item)
                add("loras", name, strength)
    out["models"] = models
    return out


def pack_adetailer(values: dict[str, Any]) -> dict[str, Any]:
    from features.generate.scripts.workflow.comfy_fill import (
        adetailer_meta_fields,
        _adetailer_kind_diffusion,
        _adetailer_unit_for_fill,
    )
    from features.generate.scripts.workflow.compose import _adetailer_units, _flag

    units: list[dict[str, Any]] = []
    for raw in _adetailer_units(values):
        unit = _adetailer_unit_for_fill(raw, values)
        snap = adetailer_meta_fields(unit, values)
        models: list[dict[str, Any]] = []
        seen: set[str] = set()
        detector = str(unit.get("detector") or "")
        _push_model(models, seen, "ultralytics", detector, _hashes_for("ultralytics", detector))
        sam = str(unit.get("sam_model") or unit.get("samModel") or "")
        _push_model(models, seen, "sams", sam, _hashes_for("sams", sam))
        if _flag(unit, "model_override", "modelOverride"):
            ckpt = str(unit.get("checkpoint") or "")
            if _adetailer_kind_diffusion(unit):
                _push_model(models, seen, "diffusion_models", ckpt, _hashes_for("diffusion_models", ckpt))
            else:
                kind, row = _hash_named(ckpt, ("checkpoints", "diffusion_models"))
                _push_model(models, seen, kind or "checkpoints", ckpt, row)
            vae = str(unit.get("vae") or "")
            _push_model(models, seen, "vae", vae, _hashes_for("vae", vae))
            encoder = str(unit.get("text_encoder") or unit.get("textEncoder") or "")
            _push_model(models, seen, "text_encoders", encoder, _hashes_for("text_encoders", encoder))
        if _flag(unit, "lora_override", "loraOverride"):
            rows = unit.get("loras")
            if isinstance(rows, list):
                for item in rows:
                    name, strength = _lora_ref(item)
                    _push_model(models, seen, "loras", name, _hashes_for("loras", name), strength)
        snap["models"] = models
        units.append(snap)
    return {"units": units}


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


def _push_model(
    out: list[dict[str, Any]],
    seen: set[str],
    kind: str,
    rel: str,
    row: dict[str, str] | None = None,
    strength: float | None = None,
) -> None:
    name = str(rel or "").replace("\\", "/").strip()
    hashes_row = dict(row) if row else {}
    if kind == "loras" and name:
        name = _canonical_lora(name)
        if not hashes_row:
            hashes_row = _hashes_for("loras", name)
    if not name and not hashes_row:
        return
    key = str(hashes_row.get("sha256") or hashes_row.get("autov2") or name)
    if not key or key in seen:
        return
    seen.add(key)
    item: dict[str, Any] = {"kind": kind}
    if hashes_row:
        item["hashes"] = hashes_row
    if name:
        item["path"] = name
    if strength is not None:
        item["strength"] = strength
    out.append(item)


def _hires_node(node: dict[str, Any]) -> bool:
    return "hires" in str((node.get("_meta") or {}).get("title") or "").lower()


def _adetailer_node(node: dict[str, Any], key: str = "") -> bool:
    if str(key).startswith("adetailer/"):
        return True
    return "adetailer" in str((node.get("_meta") or {}).get("title") or "").lower()


def collect_models(values: dict[str, Any], graph: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(kind: str, rel: str, strength: float | None = None) -> None:
        name = str(rel or "").replace("\\", "/").strip()
        _push_model(out, seen, kind, name, _hashes_for(kind, name), strength)

    ckpt = str(values.get("checkpoint") or "")
    kind, row = _hash_named(ckpt, ("checkpoints", "diffusion_models"))
    _push_model(out, seen, kind or "checkpoints", ckpt, row)
    add("vae", str(values.get("vae") or ""))
    add("text_encoders", str(values.get("text_encoder") or ""))
    rows = values.get("loras")
    have_loras = isinstance(rows, list)
    if have_loras:
        for item in rows:
            name, strength = _lora_ref(item)
            add("loras", name, strength)
    if isinstance(graph, dict):
        for key, node in graph.items():
            if not isinstance(node, dict) or _hires_node(node) or _adetailer_node(node, str(key)):
                continue
            cls = str(node.get("class_type") or "")
            inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
            if cls == "Power Lora Loader (rgthree)":
                if not have_loras:
                    for value in inputs.values():
                        if not isinstance(value, dict) or not value.get("on", True):
                            continue
                        add("loras", str(value.get("lora") or ""), _num(value.get("strength"), 1.0))
                continue
            spec = _LOADERS.get(cls)
            if not spec:
                continue
            kind, keys = spec
            if kind == "loras" and have_loras:
                continue
            for key in keys:
                add(kind, str(inputs.get(key) or ""))
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
    found: list[dict[str, Any]] = []
    for item in params.get("models") or []:
        if not isinstance(item, dict) or item.get("kind") != "loras":
            continue
        found.append(item)
    return _unique_loras(found)


def _canonical_lora(rel: str) -> str:
    name = str(rel or "").replace("\\", "/").strip()
    if not name:
        return name
    path = models.model_file("loras", name)
    if path:
        return rel_under_kind("loras", path) or name
    from features.models.scripts.loras import resolve

    found = resolve(name, [str(item["path"]) for item in models.list_kind("loras")])
    return found or name


def _lora_digest(item: dict[str, Any]) -> str:
    row = item.get("hashes") if isinstance(item.get("hashes"), dict) else {}
    return str(row.get("sha256") or row.get("autov2") or "").strip().casefold()


def _lora_path(item: dict[str, Any]) -> str:
    return str(item.get("path") or "").replace("\\", "/").strip().strip("/").casefold()


def _lora_path_alias(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return left.endswith("/" + right) or right.endswith("/" + left)


def _prefer_lora(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    cur_hash = _lora_digest(current)
    inc_hash = _lora_digest(incoming)
    if inc_hash and not cur_hash:
        chosen = dict(incoming)
    elif cur_hash and not inc_hash:
        chosen = dict(current)
    elif len(_lora_path(incoming)) > len(_lora_path(current)):
        chosen = dict(incoming)
    else:
        chosen = dict(current)
    if not chosen.get("path"):
        path = current.get("path") or incoming.get("path")
        if path:
            chosen["path"] = path
    if not chosen.get("hashes"):
        hashes_row = current.get("hashes") or incoming.get("hashes")
        if hashes_row:
            chosen["hashes"] = hashes_row
    return chosen


def _unique_loras(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        digest = _lora_digest(item)
        path = _lora_path(item)
        index = -1
        for i, existing in enumerate(out):
            other_digest = _lora_digest(existing)
            if digest and other_digest and digest == other_digest:
                index = i
                break
            if _lora_path_alias(path, _lora_path(existing)):
                index = i
                break
        if index < 0:
            out.append(item)
        else:
            out[index] = _prefer_lora(out[index], item)
    return out


def _hashes_for(kind: str, rel: str) -> dict[str, str]:
    name = str(rel or "").replace("\\", "/").strip()
    if not name or kind == "wildcards":
        return {}
    path = models.model_file(kind, name)
    if not path and kind == "loras":
        name = _canonical_lora(name)
        path = models.model_file(kind, name)
    if not path:
        return {}
    row = hashes.entry(path) or {}
    if not row:
        if kind in models.HASH_KINDS:
            hashes.wait(path)
        else:
            hashes.request(path, urgent=True)
        row = hashes.entry(path) or {}
    return {key: str(row[key]) for key in HASH_KEYS if row.get(key)}


def _hash_named(rel: str, kinds: tuple[str, ...]) -> tuple[str, dict[str, str]]:
    name = str(rel or "").replace("\\", "/").strip()
    empty = ""
    for kind in kinds:
        row = _hashes_for(kind, name)
        if row:
            return kind, row
        if not empty and name and models.model_file(kind, name):
            empty = kind
    return empty, {}


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


def is_digest(value: str) -> bool:
    raw = str(value or "").strip()
    return len(raw) in {8, 10, 12, 64} and all(char in "0123456789abcdefABCDEF" for char in raw)


def name_for_model(kind: str, item: Any) -> str:
    if not isinstance(item, dict):
        return ""
    lookup = "diffusion_models" if kind == "diffusion_models" else kind
    resolved = rel_for_hashes(lookup, item.get("hashes"))
    if resolved and not is_digest(resolved):
        return resolved
    hint = str(item.get("path") or "").replace("\\", "/").strip().strip("/")
    if hint:
        return hint
    return resolved


def rel_for_hashes(kind: str, row: Any) -> str:
    wanted = {str(row.get(key) or "").lower() for key in HASH_KEYS} if isinstance(row, dict) else set()
    wanted.discard("")
    if not wanted:
        return ""
    path = hashes.find_path(wanted)
    if path is None:
        return str((row or {}).get("autov2") or (row or {}).get("sha256") or "")
    rel = rel_under_kind(kind, path)
    return rel or str(row.get("autov2") or row.get("sha256") or "")


def rel_under_kind(kind: str, path: Path) -> str:
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
