from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from config import WORKFLOWS

HIRES_UTILS = {
    "checkpoints": ("image_checkpoint", "hiresfix"),
    "diffusion_models": ("image_diffusion", "hiresfix"),
}
ADETAILER_UTILS = {
    "checkpoints": ("image_checkpoint", "adetailer"),
    "diffusion_models": ("image_diffusion", "adetailer"),
}
_DIFFUSION_KINDS = {"diffusion_models", "diffusion", "unet"}
_META_KEYS = {"apply", "extras", "ports", "attach"}


def _is_link(value: Any) -> bool:
    return isinstance(value, (list, tuple)) and len(value) == 2 and not isinstance(value[0], (list, dict))


def _title(node: dict[str, Any]) -> str:
    return str((node.get("_meta") or {}).get("title") or "").lower()


def _flag(blob: dict[str, Any], snake: str, camel: str, default: bool = False) -> bool:
    if snake in blob or camel in blob:
        return bool(blob.get(snake) if blob.get(snake) is not None else blob.get(camel))
    return default


def _hires_blob(values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("hires")
    return raw if isinstance(raw, dict) else {}


def hires_enabled(values: dict[str, Any]) -> bool:
    return bool(_hires_blob(values).get("enabled"))


def _port_in(title: str) -> str | None:
    text = title.strip()
    upper = text.upper()
    if upper.startswith("PORT_OUT:"):
        return None
    if not upper.startswith("PORT:"):
        return None
    name = text.split(":", 1)[1].strip().upper()
    return name or None


def _safe_stem(name: str) -> str:
    stem = Path(name).stem
    if not stem or stem in {".", ".."} or stem.endswith("_raw"):
        raise FileNotFoundError(f"util not found: {name}")
    return stem


def load_util(family: str, stem: str) -> dict[str, Any]:
    ident = _safe_stem(stem)
    path = WORKFLOWS / family / "utils" / f"{ident}.json"
    if not path.is_file():
        raise FileNotFoundError(f"util not found: {family}/{ident}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise FileNotFoundError(f"util not found: {family}/{ident}")
    return data


def hires_util_ref(blob: dict[str, Any]) -> tuple[str, str]:
    kind = str(blob.get("kind") or blob.get("model_kind") or "").strip().lower()
    if kind in _DIFFUSION_KINDS:
        return HIRES_UTILS["diffusion_models"]
    return HIRES_UTILS["checkpoints"]


def hires_util_stem(blob: dict[str, Any]) -> str:
    return hires_util_ref(blob)[1]


def _rewire_consumers(workflow: dict[str, Any], src: str, dest: list[Any]) -> None:
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in list(inputs.items()):
            if _is_link(value) and str(value[0]) == src:
                inputs[key] = [dest[0], dest[1]]


def _rewire_slot(workflow: dict[str, Any], src: str, src_slot: int, dest: list[Any]) -> None:
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in list(inputs.items()):
            if not _is_link(value) or str(value[0]) != str(src):
                continue
            try:
                slot = int(value[1])
            except (TypeError, ValueError):
                continue
            if slot == src_slot:
                inputs[key] = [dest[0], dest[1]]


def _remap_util(util: dict[str, Any], prefix: str) -> tuple[dict[str, Any], dict[str, str], dict[str, Any]]:
    nodes: dict[str, Any] = {}
    id_map: dict[str, str] = {}
    for key, node in util.items():
        if key in _META_KEYS or not isinstance(node, dict) or not node.get("class_type"):
            continue
        new_key = f"{prefix}/{key}"
        id_map[str(key)] = new_key
        nodes[new_key] = copy.deepcopy(node)
    for node in nodes.values():
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for key, value in list(inputs.items()):
            if _is_link(value) and str(value[0]) in id_map:
                inputs[key] = [id_map[str(value[0])], value[1]]
    meta = {key: copy.deepcopy(util[key]) for key in _META_KEYS if key in util}
    return nodes, id_map, meta


def _rewire_final_save(workflow: dict[str, Any], image: list[Any]) -> None:
    for node in workflow.values():
        if not isinstance(node, dict) or node.get("class_type") != "SaveImage":
            continue
        if "first" in _title(node):
            continue
        node.setdefault("inputs", {})["images"] = [image[0], image[1]]


def apply_stage(host: dict[str, Any], util: dict[str, Any], prefix: str) -> dict[str, Any]:
    workflow = copy.deepcopy(host)
    host_ports = workflow.get("ports") if isinstance(workflow.get("ports"), dict) else {}
    nodes, id_map, meta = _remap_util(util, prefix)
    workflow.update(nodes)
    stubs: list[str] = []
    for key, node in nodes.items():
        name = _port_in(_title(node))
        if not name:
            continue
        port = host_ports.get(name) or host_ports.get(name.lower())
        if not _is_link(port):
            raise ValueError(f"host missing port {name}")
        _rewire_consumers(workflow, key, [port[0], port[1]])
        stubs.append(key)
    for key in stubs:
        workflow.pop(key, None)
    out = meta.get("ports") if isinstance(meta.get("ports"), dict) else {}
    image = out.get("IMAGE") or out.get("image")
    if _is_link(image):
        src = str(image[0])
        dest = [id_map.get(src, src), image[1]]
        _rewire_final_save(workflow, dest)
        ports = workflow.get("ports")
        if isinstance(ports, dict):
            ports["IMAGE"] = dest
    return workflow


def apply_hires(workflow: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("hires")
    blob = raw if isinstance(raw, dict) else {}
    return apply_stage(workflow, load_util(*hires_util_ref(blob)), "hires")


def _adetailer_units(values: dict[str, Any]) -> list[dict[str, Any]]:
    raw = values.get("adetailer")
    blob = raw if isinstance(raw, dict) else {}
    if not blob.get("enabled"):
        return []
    rows = blob.get("units")
    if not isinstance(rows, list):
        return []
    return [item for item in rows if isinstance(item, dict) and item.get("enabled", True)]


def adetailer_util_ref(unit: dict[str, Any]) -> tuple[str, str]:
    kind = str(unit.get("kind") or unit.get("model_kind") or "").strip().lower()
    if kind in _DIFFUSION_KINDS:
        return ADETAILER_UTILS["diffusion_models"]
    return ADETAILER_UTILS["checkpoints"]


def adetailer_util_stem(unit: dict[str, Any]) -> str:
    return adetailer_util_ref(unit)[1]


def apply_adetailer(workflow: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    units = _adetailer_units(values)
    if not units:
        return workflow
    out = workflow
    for index, unit in enumerate(units):
        out = apply_stage(out, load_util(*adetailer_util_ref(unit)), f"adetailer/{index}")
    return out
