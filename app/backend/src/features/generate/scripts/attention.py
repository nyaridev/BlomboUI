from __future__ import annotations

import subprocess
import time
from typing import Any

from config import launcher_env
from features.generate.scripts.compose import _adetailer_units

_PROBE = "s=0;f=0\ntry:\n import sageattention\n s=1\nexcept Exception:\n pass\ntry:\n import flash_attn\n f=1\nexcept Exception:\n pass\nprint(s,f)"
_TTL = 60.0
_cache: tuple[float, bool, bool] | None = None


def installed() -> tuple[bool, bool]:
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < _TTL:
        return _cache[1], _cache[2]
    sage, flash = _probe()
    _cache = (now, sage, flash)
    return sage, flash


def _probe() -> tuple[bool, bool]:
    py = launcher_env().get("comfyui.python")
    if not py:
        return False, False
    try:
        raw = subprocess.check_output([str(py), "-I", "-c", _PROBE], timeout=20, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return False, False
    parts = raw.decode("utf-8", "replace").split()
    if len(parts) < 2:
        return False, False
    return parts[0] == "1", parts[1] == "1"


def usable(cfg: dict[str, Any] | None) -> dict[str, Any] | None:
    if not cfg:
        return None
    sage, flash = installed()
    engine = cfg["engine"]
    if engine == "flash":
        if flash:
            return cfg
        return {**cfg, "engine": "sage"} if sage else None
    if sage:
        return cfg
    return {**cfg, "engine": "flash"} if flash else None

SAGE_CLASS = "PathchSageAttentionKJ"
FLASH_CLASS = "PatchFlashAttentionKJ"
SAGE_MODES = (
    "auto",
    "sageattn_qk_int8_pv_fp16_cuda",
    "sageattn_qk_int8_pv_fp16_triton",
    "sageattn_qk_int8_pv_fp8_cuda",
    "sageattn_qk_int8_pv_fp8_cuda++",
    "sageattn3",
    "sageattn3_per_block_mean",
)


def _flag(blob: dict[str, Any], snake: str, camel: str, default: bool = False) -> bool:
    if snake in blob or camel in blob:
        return bool(blob.get(snake) if blob.get(snake) is not None else blob.get(camel))
    return default


def _hires_blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("hires")
    return raw if isinstance(raw, dict) else {}


def _hires_on(values: dict[str, Any]) -> bool:
    return bool(_hires_blob(values).get("enabled"))


def _from_hires(values: dict[str, Any], unit: dict[str, Any] | None) -> bool:
    if isinstance(unit, dict) and ("from_hires" in unit or "fromHires" in unit):
        raw = unit.get("from_hires")
        if raw is None:
            raw = unit.get("fromHires")
        return bool(raw)
    blob = values.get("adetailer")
    if not isinstance(blob, dict):
        return True
    if "from_hires" in blob:
        return bool(blob["from_hires"])
    if "fromHires" in blob:
        return bool(blob["fromHires"])
    return True


def _title(node: dict[str, Any]) -> str:
    return str((node.get("_meta") or {}).get("title") or "").lower()


def _is_hires(node: dict[str, Any]) -> bool:
    return "hires" in _title(node)


def _is_link(value: Any) -> bool:
    return isinstance(value, (list, tuple)) and len(value) == 2 and not isinstance(value[0], (list, dict))


def _adetailer_index(key: str) -> int | None:
    parts = str(key).split("/")
    if len(parts) < 3 or parts[0] != "adetailer":
        return None
    try:
        return int(parts[1])
    except ValueError:
        return None


def clean_attention(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    engine = str(src.get("engine") or src.get("attentionEngine") or src.get("attention_engine") or "sage")
    if engine not in {"sage", "flash"}:
        engine = "sage"
    sage = str(src.get("sageAttention") or src.get("sage_attention") or "auto").strip() or "auto"
    if sage not in SAGE_MODES:
        sage = "auto"
    compile_raw = src.get("allowCompile")
    if compile_raw is None:
        compile_raw = src.get("allow_compile")
    allow = bool(compile_raw)
    return {
        "enabled": bool(src.get("enabled")),
        "engine": engine,
        "sage_attention": sage,
        "sageAttention": sage,
        "allow_compile": allow,
        "allowCompile": allow,
    }


def _override_cfg(blob: dict[str, Any]) -> dict[str, Any]:
    packed = clean_attention({**blob, "enabled": True})
    packed["enabled"] = True
    return packed


def stage_attention(values: dict[str, Any], stage: str, unit: dict[str, Any] | None = None) -> dict[str, Any] | None:
    first = clean_attention(values.get("attention"))
    first_on = first if first["enabled"] else None
    hires = _hires_blob(values)
    if stage == "first":
        return first_on
    if stage == "hires":
        if _flag(hires, "attention_override", "attentionOverride"):
            return _override_cfg(hires)
        return first_on
    if unit is not None and _flag(unit, "attention_override", "attentionOverride"):
        return _override_cfg(unit)
    if unit is not None and _from_hires(values, unit) and _hires_on(values):
        return stage_attention(values, "hires")
    return first_on


def attention_meta(cfg: dict[str, Any] | None) -> dict[str, Any]:
    if not cfg:
        return {}
    out: dict[str, Any] = {"engine": cfg["engine"], "allow_compile": cfg["allow_compile"]}
    if cfg["engine"] == "sage":
        out["sage_attention"] = cfg["sage_attention"]
    return out


def _typed(workflow: dict[str, Any], kind: str, hires: bool | None = None) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for key, node in workflow.items():
        if not isinstance(node, dict) or node.get("class_type") != kind:
            continue
        if hires is True and not _is_hires(node):
            continue
        if hires is False and _is_hires(node):
            continue
        out.append((str(key), node))
    return out


def _model_link(node: dict[str, Any]) -> list[Any] | None:
    raw = (node.get("inputs") or {}).get("model")
    return [raw[0], raw[1]] if _is_link(raw) else None


def _cfg_key(cfg: dict[str, Any]) -> str:
    if cfg["engine"] == "flash":
        return f"flash:{int(bool(cfg['allow_compile']))}"
    return f"sage:{cfg['sage_attention']}:{int(bool(cfg['allow_compile']))}"


def _src_key(link: list[Any]) -> str:
    return f"{link[0]}:{link[1]}"


def _hires_clip_vae(workflow: dict[str, Any]) -> tuple[list[Any] | None, list[Any] | None]:
    pos = [(k, n) for k, n in _typed(workflow, "CLIPTextEncode", True) if "negative" not in _title(n)]
    clip = None
    if pos:
        raw = (pos[0][1].get("inputs") or {}).get("clip")
        if _is_link(raw):
            clip = [raw[0], raw[1]]
    vae = None
    dec = _typed(workflow, "VAEDecode", True)
    if dec:
        raw = (dec[0][1].get("inputs") or {}).get("vae")
        if _is_link(raw):
            vae = [raw[0], raw[1]]
    return clip, vae


def _patch_node(cfg: dict[str, Any], model: list[Any]) -> dict[str, Any]:
    if cfg["engine"] == "flash":
        return {
            "class_type": FLASH_CLASS,
            "inputs": {"model": model, "allow_compile": bool(cfg["allow_compile"])},
            "_meta": {"title": "Patch Flash Attention KJ"},
        }
    return {
        "class_type": SAGE_CLASS,
        "inputs": {
            "model": model,
            "sage_attention": cfg["sage_attention"],
            "allow_compile": bool(cfg["allow_compile"]),
        },
        "_meta": {"title": "Patch Sage Attention KJ"},
    }


def apply_attention(workflow: dict[str, Any], values: dict[str, Any]) -> None:
    first_ks = _typed(workflow, "KSampler", False)
    hires_ks = _typed(workflow, "KSampler", True)
    first_src = _model_link(first_ks[0][1]) if first_ks else None
    hires_src = _model_link(hires_ks[0][1]) if hires_ks else None
    hires_clip, hires_vae = _hires_clip_vae(workflow) if hires_ks else (None, None)
    units = _adetailer_units(values)
    patches: dict[tuple[str, str], str] = {}
    next_id = 0

    def get_patch(src: list[Any], cfg: dict[str, Any]) -> str:
        nonlocal next_id
        key = (_src_key(src), _cfg_key(cfg))
        existing = patches.get(key)
        if existing:
            return existing
        ident = f"attn/{next_id}"
        next_id += 1
        workflow[ident] = _patch_node(cfg, src)
        patches[key] = ident
        return ident

    def set_model(node: dict[str, Any], src: list[Any] | None, cfg: dict[str, Any] | None) -> None:
        if src is None:
            return
        inputs = node.setdefault("inputs", {})
        if not cfg:
            inputs["model"] = src
            return
        inputs["model"] = [get_patch(src, cfg), 0]

    if first_ks and first_src:
        set_model(first_ks[0][1], first_src, usable(stage_attention(values, "first")))
    if hires_ks and hires_src:
        set_model(hires_ks[0][1], hires_src, usable(stage_attention(values, "hires")) if _hires_on(values) else None)

    for key, node in list(workflow.items()):
        if not isinstance(node, dict) or node.get("class_type") != "FaceDetailer":
            continue
        index = _adetailer_index(str(key))
        unit = units[index] if index is not None and index < len(units) else {}
        share = (
            _from_hires(values, unit)
            and _hires_on(values)
            and not _flag(unit, "model_override", "modelOverride")
            and not _flag(unit, "lora_override", "loraOverride")
        )
        if share and hires_src is not None:
            src = hires_src
            if hires_clip is not None:
                node.setdefault("inputs", {})["clip"] = hires_clip
            if hires_vae is not None:
                node.setdefault("inputs", {})["vae"] = hires_vae
        else:
            src = _model_link(node)
        set_model(node, src, usable(stage_attention(values, "adetailer", unit)))
