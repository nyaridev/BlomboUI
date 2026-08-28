from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from config import WORKFLOWS

HIRES_UTILS = {
    "checkpoints": "hiresfix_checkpoint",
    "diffusion_models": "hiresfix_diffusion",
}
_DIFFUSION_KINDS = {"diffusion_models", "diffusion", "unet"}
_META_KEYS = {"apply", "extras", "ports", "attach"}


def _is_link(value: Any) -> bool:
    return isinstance(value, (list, tuple)) and len(value) == 2 and not isinstance(value[0], (list, dict))


def _title(node: dict[str, Any]) -> str:
    return str((node.get("_meta") or {}).get("title") or "")


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


def load_util(name: str) -> dict[str, Any]:
    stem = _safe_stem(name)
    path = WORKFLOWS / "utils" / f"{stem}.json"
    if not path.is_file():
        raise FileNotFoundError(f"util not found: {stem}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise FileNotFoundError(f"util not found: {stem}")
    return data


def hires_util_stem(blob: dict[str, Any]) -> str:
    kind = str(blob.get("kind") or blob.get("model_kind") or "").strip().lower()
    if kind in _DIFFUSION_KINDS:
        return HIRES_UTILS["diffusion_models"]
    return HIRES_UTILS["checkpoints"]


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
        if "first" in _title(node).lower():
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
        _rewire_final_save(workflow, [id_map.get(src, src), image[1]])
    return workflow


def apply_hires(workflow: dict[str, Any], values: dict[str, Any]) -> dict[str, Any]:
    raw = values.get("hires")
    blob = raw if isinstance(raw, dict) else {}
    return apply_stage(workflow, load_util(hires_util_stem(blob)), "hires")
