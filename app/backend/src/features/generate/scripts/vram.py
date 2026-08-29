from __future__ import annotations

from typing import Any

from features.generate.scripts.attention import _flag, _from_hires, _hires_blob, _hires_on, stage_attention
from features.generate.scripts.compose import _adetailer_units
from features.settings import service as settings
from infrastructure.comfy import client as comfy

_last: tuple[str, str, str] | None = None


def reset() -> None:
    global _last
    _last = None


def _pick(blob: dict[str, Any], *keys: str) -> str:
    for key in keys:
        if blob.get(key) is not None:
            return str(blob.get(key) or "")
    return ""


def _loras(raw: Any) -> tuple[str, ...]:
    rows: list[str] = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            name, strength = item, 1.0
        elif isinstance(item, dict):
            name = str(item.get("lora") or item.get("path") or "")
            try:
                raw_strength = item.get("strength", 1)
                strength = float(raw_strength if raw_strength is not None else 1)
            except (TypeError, ValueError):
                strength = 1.0
        else:
            continue
        name = name.strip()
        if name:
            rows.append(f"{name}:{strength:g}")
    return tuple(rows)


def _attn(cfg: dict[str, Any] | None) -> str:
    if not cfg:
        return "off"
    if cfg["engine"] == "flash":
        return f"flash:{int(bool(cfg['allow_compile']))}"
    return f"sage:{cfg['sage_attention']}:{int(bool(cfg['allow_compile']))}"


def _model_ids(blob: dict[str, Any]) -> tuple[str, str, str]:
    return (
        _pick(blob, "checkpoint"),
        _pick(blob, "vae"),
        _pick(blob, "text_encoder", "textEncoder"),
    )


def _prompt_parts(values: dict[str, Any]) -> tuple[Any, ...]:
    prompt = _pick(values, "prompt")
    negative = _pick(values, "negative_prompt", "negativePrompt")
    parts: list[Any] = [prompt, negative]
    hires = _hires_blob(values)
    if _hires_on(values):
        parts.append(_pick(hires, "prompt") if _flag(hires, "prompt_override", "promptOverride") else prompt)
        parts.append(
            _pick(hires, "negative_prompt", "negativePrompt")
            if _flag(hires, "negative_override", "negativeOverride")
            else negative
        )
    for index, unit in enumerate(_adetailer_units(values)):
        share_hires = _from_hires(values, unit) and _hires_on(values)
        if _flag(unit, "prompt_override", "promptOverride"):
            parts.append(_pick(unit, "prompt"))
        elif share_hires and _flag(hires, "prompt_override", "promptOverride"):
            parts.append(_pick(hires, "prompt"))
        else:
            parts.append(prompt)
        if _flag(unit, "negative_override", "negativeOverride"):
            parts.append(_pick(unit, "negative_prompt", "negativePrompt"))
        elif share_hires and _flag(hires, "negative_override", "negativeOverride"):
            parts.append(_pick(hires, "negative_prompt", "negativePrompt"))
        else:
            parts.append(negative)
        parts.append(index)
    return tuple(parts)


def _weights_parts(values: dict[str, Any]) -> tuple[Any, ...]:
    base_loras = _loras(values.get("loras"))
    parts: list[Any] = [
        _pick(values, "workflow"),
        *_model_ids(values),
        base_loras,
        _attn(stage_attention(values, "first")),
    ]
    hires = _hires_blob(values)
    if _hires_on(values):
        chain: list[Any] = ["hires"]
        chain.append(_model_ids(hires) if _flag(hires, "model_override", "modelOverride") else "base")
        chain.append(_loras(hires.get("loras")) if _flag(hires, "lora_override", "loraOverride") else base_loras)
        chain.append(_attn(stage_attention(values, "hires")))
        parts.append(tuple(chain))
    for index, unit in enumerate(_adetailer_units(values)):
        share_hires = _from_hires(values, unit) and _hires_on(values)
        chain = [f"ad:{index}"]
        if _flag(unit, "model_override", "modelOverride"):
            chain.append(_model_ids(unit))
        elif share_hires and _flag(hires, "model_override", "modelOverride"):
            chain.append("hires")
        else:
            chain.append("base")
        if _flag(unit, "lora_override", "loraOverride"):
            chain.append(_loras(unit.get("loras")))
        elif share_hires and _flag(hires, "lora_override", "loraOverride"):
            chain.append(_loras(hires.get("loras")))
        else:
            chain.append(base_loras)
        chain.append(_attn(stage_attention(values, "adetailer", unit)))
        parts.append(tuple(chain))
    return tuple(parts)


def prompt_key(values: dict[str, Any]) -> str:
    return repr(_prompt_parts(values))


def weights_key(values: dict[str, Any]) -> str:
    return repr(_weights_parts(values))


def fingerprint(values: dict[str, Any]) -> str:
    return repr((prompt_key(values), weights_key(values)))


def _gates() -> tuple[set[str], bool, bool]:
    data = settings.load()
    raw = data.get("vramUnloadWorkflows")
    if isinstance(raw, list):
        listed = {str(item).strip() for item in raw if str(item).strip()}
    else:
        listed = {"krea2"}
    on_prompt = True if "vramUnloadOnPrompt" not in data else bool(data.get("vramUnloadOnPrompt"))
    on_weights = True if "vramUnloadOnWeights" not in data else bool(data.get("vramUnloadOnWeights"))
    return listed, on_prompt, on_weights


def maybe_unload(values: dict[str, Any]) -> bool:
    global _last
    wf = _pick(values, "workflow")
    prompt = prompt_key(values)
    weights = weights_key(values)
    listed, on_prompt, on_weights = _gates()
    prev = _last
    _last = (wf, prompt, weights)
    if wf not in listed:
        return False
    if not on_prompt and not on_weights:
        return False
    should = False
    if prev is None or prev[0] != wf:
        should = True
    elif (on_prompt and prev[1] != prompt) or (on_weights and prev[2] != weights):
        should = True
    if should:
        comfy.free(True, True)
    return should
