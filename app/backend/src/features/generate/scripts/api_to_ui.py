from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from config import WORKFLOWS

_OUTPUTS: dict[str, list[tuple[str, str]]] = {
    "CheckpointLoaderSimple": [("MODEL", "MODEL"), ("CLIP", "CLIP"), ("VAE", "VAE")],
    "UNETLoader": [("MODEL", "MODEL")],
    "CLIPLoader": [("CLIP", "CLIP")],
    "VAELoader": [("VAE", "VAE")],
    "CLIPTextEncode": [("CONDITIONING", "CONDITIONING")],
    "KSampler": [("LATENT", "LATENT")],
    "EmptyLatentImage": [("LATENT", "LATENT")],
    "VAEDecode": [("IMAGE", "IMAGE")],
    "VAEEncode": [("LATENT", "LATENT")],
    "SaveImage": [],
    "Power Lora Loader (rgthree)": [("MODEL", "MODEL"), ("CLIP", "CLIP")],
    "UpscaleModelLoader": [("UPSCALE_MODEL", "UPSCALE_MODEL")],
    "ImageUpscaleWithModel": [("IMAGE", "IMAGE")],
    "ImageScale": [("IMAGE", "IMAGE")],
    "LoadImage": [("IMAGE", "IMAGE"), ("MASK", "MASK")],
    "easy cleanGpuUsed": [("*", "*")],
}


def _is_link(value: Any) -> bool:
    return isinstance(value, (list, tuple)) and len(value) == 2 and not isinstance(value[0], (list, dict))


def _node_id(key: str, index: int) -> int:
    try:
        return int(key)
    except (TypeError, ValueError):
        return 1000 + index


def to_ui_workflow(api: dict[str, Any]) -> dict[str, Any]:
    items: list[tuple[int, str, dict[str, Any]]] = []
    for index, (key, node) in enumerate(api.items()):
        if not isinstance(node, dict) or not node.get("class_type"):
            continue
        items.append((_node_id(str(key), index), str(key), node))
    id_map = {old: new for new, old, _ in items}
    links: list[list[Any]] = []
    outgoing: dict[tuple[int, int], list[int]] = {}
    incoming: dict[tuple[int, str], tuple[int, int, str]] = {}
    link_id = 1
    for new_id, _old, node in items:
        inputs = node.get("inputs") or {}
        if not isinstance(inputs, dict):
            continue
        for name, value in inputs.items():
            if not _is_link(value):
                continue
            src_old = str(value[0])
            if src_old not in id_map:
                continue
            src_id = id_map[src_old]
            src_slot = int(value[1])
            src_kind = str((api.get(src_old) or {}).get("class_type") or "")
            outputs = _OUTPUTS.get(src_kind) or []
            link_type = outputs[src_slot][1] if 0 <= src_slot < len(outputs) else "*"
            links.append([link_id, src_id, src_slot, new_id, -1, link_type])
            outgoing.setdefault((src_id, src_slot), []).append(link_id)
            incoming[(new_id, str(name))] = (link_id, src_id, link_type)
            link_id += 1
    input_slot: dict[tuple[int, str], int] = {}
    for new_id, _old, node in items:
        slot = 0
        inputs = node.get("inputs") or {}
        if not isinstance(inputs, dict):
            continue
        for name, value in inputs.items():
            if _is_link(value):
                input_slot[(new_id, str(name))] = slot
                slot += 1
    for row in links:
        dest_id = row[3]
        for (nid, name), slot in input_slot.items():
            if nid == dest_id and incoming.get((nid, name), (None,))[0] == row[0]:
                row[4] = slot
                break
    nodes: list[dict[str, Any]] = []
    for order, (new_id, _old, node) in enumerate(items):
        kind = str(node.get("class_type") or "")
        inputs = node.get("inputs") or {}
        node_inputs = []
        widgets: list[Any] = []
        if isinstance(inputs, dict):
            for name, value in inputs.items():
                if _is_link(value):
                    link, _src, link_type = incoming.get((new_id, str(name)), (None, 0, "*"))
                    node_inputs.append({"name": name, "type": link_type, "link": link})
                else:
                    widgets.append(value)
        node_outputs = []
        for slot, (name, link_type) in enumerate(_OUTPUTS.get(kind, [])):
            node_outputs.append(
                {
                    "name": name,
                    "type": link_type,
                    "links": list(outgoing.get((new_id, slot), [])),
                    "slot_index": slot,
                }
            )
        entry: dict[str, Any] = {
            "id": new_id,
            "type": kind,
            "pos": [(order % 4) * 320, (order // 4) * 180],
            "size": [280, 100],
            "flags": {},
            "order": order,
            "mode": 0,
            "inputs": node_inputs,
            "outputs": node_outputs,
            "properties": {"Node name for S&R": kind},
            "widgets_values": widgets,
        }
        title = str((node.get("_meta") or {}).get("title") or "")
        if title:
            entry["title"] = title
        nodes.append(entry)
    last_node = max((node["id"] for node in nodes), default=0)
    last_link = max((row[0] for row in links), default=0)
    return {
        "last_node_id": last_node,
        "last_link_id": last_link,
        "nodes": nodes,
        "links": links,
        "groups": [],
        "config": {},
        "extra": {"ds": {"scale": 1.0, "offset": [0, 0]}},
        "version": 0.4,
    }


def write_raw_beside(path: Path) -> Path:
    data = json.loads(path.read_text(encoding="utf-8"))
    dest = path.with_name(f"{path.stem}_raw.json")
    dest.write_text(json.dumps(to_ui_workflow(data), indent=2) + "\n", encoding="utf-8")
    return dest


def write_all_raw() -> list[Path]:
    written: list[Path] = []
    for folder in ("main", "utils"):
        root = WORKFLOWS / folder
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.json")):
            if path.stem.endswith("_raw"):
                continue
            written.append(write_raw_beside(path))
    return written


if __name__ == "__main__":
    for path in write_all_raw():
        print(path)
