from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

from features.models.scripts import thumbnail_scopes
from features.models.scripts import model_thumbs

TYPES = {"checkpoints", "loras", "wildcards"}
KINDS = {"checkpoints", "diffusion_models", "loras", "wildcards"}
CHECKPOINT_KINDS = {"checkpoints", "diffusion_models"}
_LORA_TAG = re.compile(r"<lora:([^:>]+)(?::[^>]*)?>", re.I)
_WILD_TAG = re.compile(r"__(\S+?)__", re.I)


def _tidy(text: str) -> str:
    text = re.sub(r",\s*,+", ",", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip(" \t,")


def _lora_tag(path: str, tag: str = "") -> str:
    extra = str(tag or "").strip()
    if extra:
        return extra
    stem = Path(path).stem
    return f"<lora:{stem}:1>" if stem else ""


def _wild_tag(path: str, tag: str = "") -> str:
    extra = str(tag or "").strip()
    if extra:
        return extra
    posix = str(path or "").replace("\\", "/")
    name = re.sub(r"\.[^/.]+$", "", posix).strip("/")
    return f"__{name}__" if name else ""


def _prepend(text: str, chunk: str) -> str:
    extra = chunk.strip()
    if not extra:
        return text
    trimmed = _tidy(text)
    if not trimmed:
        return extra
    return f"{extra}, {trimmed}"


def _target(raw: Any) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    path = str(raw.get("path") or "").strip()
    kind = str(raw.get("kind") or "").strip()
    if not path or kind not in KINDS:
        return None
    return {
        "kind": kind,
        "path": path,
        "tag": str(raw.get("tag") or "").strip(),
    }


def _flag(raw: dict[str, Any], *keys: str, default: bool = False) -> bool:
    for key in keys:
        if key in raw and raw[key] is not None:
            return bool(raw[key])
    return default


def scope_thumbs_config(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("type") or "loras").strip()
    if kind not in TYPES:
        kind = "loras"
    targets: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw.get("targets") or []:
        row = _target(item)
        if not row:
            continue
        if kind == "checkpoints" and row["kind"] not in CHECKPOINT_KINDS:
            continue
        if kind == "loras" and row["kind"] != "loras":
            continue
        if kind == "wildcards" and row["kind"] != "wildcards":
            continue
        key = row["path"].replace("\\", "/").lower()
        if key in seen:
            continue
        seen.add(key)
        targets.append(row)
    context = thumbnail_scopes.context_key(thumbnail_scopes.parse_context(str(raw.get("context") or "")))
    skip_existing = _flag(raw, "skip_existing", "skipExisting")
    if skip_existing:
        targets = [row for row in targets if not model_thumbs.thumb_file(row["kind"], row["path"], context)]
    if not targets:
        return None
    return {
        "context": context,
        "type": kind,
        "search": str(raw.get("search") or "").strip(),
        "skip_existing": skip_existing,
        "apply_after": _flag(raw, "apply_after", "applyAfter", default=True),
        "targets": targets,
    }


def scope_thumbs_count(config: dict[str, Any] | None) -> int:
    if not config:
        return 0
    targets = config.get("targets")
    return len(targets) if isinstance(targets, list) else 0


def _strip_lora_stems(text: str, stems: set[str]) -> str:
    if not stems:
        return text

    def repl(match: re.Match[str]) -> str:
        return "" if match.group(1).lower() in stems else match.group(0)

    return _tidy(_LORA_TAG.sub(repl, text))


def _strip_wild_names(text: str, names: set[str]) -> str:
    if not names:
        return text

    def repl(match: re.Match[str]) -> str:
        return "" if match.group(1).replace("\\", "/").lower() in names else match.group(0)

    return _tidy(_WILD_TAG.sub(repl, text))


def _lora_stem(path: str, tag: str = "") -> str:
    if tag:
        match = _LORA_TAG.search(tag)
        if match:
            return match.group(1).lower()
    return Path(path).stem.lower()


def _wild_name(path: str, tag: str = "") -> str:
    if tag:
        match = _WILD_TAG.search(tag)
        if match:
            return match.group(1).replace("\\", "/").lower()
    posix = path.replace("\\", "/")
    return re.sub(r"\.[^/.]+$", "", posix).strip("/").lower()


def _apply_search(
    prompt: str,
    negative: str,
    search: str,
    replacement: str,
    negative_replacement: str | None = None,
) -> tuple[str, str]:
    if not search:
        return prompt, negative
    neg_repl = replacement if negative_replacement is None else negative_replacement
    if search in prompt:
        prompt = prompt.replace(search, replacement)
    if search in negative:
        negative = negative.replace(search, neg_repl)
    return _tidy(prompt), _tidy(negative)


def _lora_meta(path: str) -> dict[str, Any]:
    from features.models.scripts import model_meta
    from features.settings import service as settings

    info = model_meta.get_info("loras", path)
    auto = info.get("auto_apply")
    if not isinstance(auto, bool):
        auto = bool(settings.load().get("loraAutoApply", True))
    try:
        strength = float(info.get("strength") if info.get("strength") is not None else 1)
    except (TypeError, ValueError):
        strength = 1.0
    if not math.isfinite(strength):
        strength = 1.0
    return {
        "instant": auto,
        "strength": strength,
        "prompt": str(info.get("prompt") or ""),
        "negative_prompt": str(info.get("negative_prompt") or ""),
    }


def _queue_lora(values: dict[str, Any], path: str, strength: float | None = None, inject: bool = True) -> None:
    name = path.strip()
    if not name:
        return
    rows = values.get("auto_loras")
    if not isinstance(rows, list):
        rows = []
    key = name.replace("\\", "/").lower()
    kept: list[Any] = []
    for item in rows:
        if isinstance(item, dict):
            current = str(item.get("path") or item.get("lora") or "")
        else:
            current = str(item or "")
        if current.replace("\\", "/").lower() == key:
            continue
        kept.append(item)
    entry: dict[str, Any] = {"path": name}
    if strength is not None:
        entry["strength"] = strength
    if not inject:
        entry["inject"] = False
    values["auto_loras"] = [entry, *kept]


def _with_triggers(tag: str, extra: str) -> str:
    extra = extra.strip()
    if not extra:
        return tag
    if not tag:
        return extra
    return f"{tag}, {extra}"


def scope_thumb_run_values(values: dict[str, Any], config: dict[str, Any], index: int) -> dict[str, Any]:
    targets = config.get("targets") if isinstance(config.get("targets"), list) else []
    target = targets[index] if 0 <= index < len(targets) else None
    auto = values.get("auto_loras")
    run_values = {
        **values,
        "auto_loras": list(auto) if isinstance(auto, list) else [],
        "batch_size": 1,
        "prompt": str(values.get("prompt") or ""),
        "negative_prompt": str(values.get("negative_prompt") or ""),
        "scope_thumb_target": dict(target) if isinstance(target, dict) else None,
    }
    if not isinstance(target, dict):
        return run_values
    kind = str(config.get("type") or "")
    search = str(config.get("search") or "").strip()
    path = str(target.get("path") or "")
    if kind == "checkpoints":
        run_values["checkpoint"] = path
        return run_values
    if kind == "loras":
        tag = _lora_tag(path, str(target.get("tag") or ""))
        meta = _lora_meta(path)
        if search:
            if meta["instant"]:
                prompt, negative = _apply_search(
                    str(run_values["prompt"]),
                    str(run_values["negative_prompt"]),
                    search,
                    str(meta["prompt"] or "").strip(),
                    str(meta["negative_prompt"] or "").strip(),
                )
                run_values["prompt"] = prompt
                run_values["negative_prompt"] = negative
                _queue_lora(run_values, path, meta["strength"], inject=False)
                return run_values
            prompt, negative = _apply_search(
                str(run_values["prompt"]),
                str(run_values["negative_prompt"]),
                search,
                _with_triggers(tag, str(meta["prompt"] or "")),
                _with_triggers(tag, str(meta["negative_prompt"] or "")),
            )
            run_values["prompt"] = prompt
            run_values["negative_prompt"] = negative
            return run_values
        if meta["instant"]:
            _queue_lora(run_values, path, meta["strength"])
            return run_values
        stem = _lora_stem(path, tag)
        prompt = str(run_values["prompt"])
        if stem:
            prompt = _strip_lora_stems(prompt, {stem})
        run_values["prompt"] = _prepend(prompt, tag)
        return run_values
    if kind == "wildcards":
        tag = _wild_tag(path, str(target.get("tag") or ""))
        if search:
            prompt, negative = _apply_search(
                str(run_values["prompt"]),
                str(run_values["negative_prompt"]),
                search,
                tag,
            )
            run_values["prompt"] = prompt
            run_values["negative_prompt"] = negative
            return run_values
        name = _wild_name(path, tag)
        prompt = str(run_values["prompt"])
        if name:
            prompt = _strip_wild_names(prompt, {name})
        run_values["prompt"] = _prepend(prompt, tag)
    return run_values
