from __future__ import annotations

import copy
from typing import Any, Callable

from features.models.scripts import loras as lora_tags


def fill_power_loras(
    inputs: dict[str, Any], values: dict[str, Any], filename: Callable[[str], str]
) -> None:
    for key in [key for key in inputs if str(key).startswith("lora_")]:
        del inputs[key]
    rows = values.get("loras")
    if not isinstance(rows, list):
        return
    index = 1
    for item in rows:
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
        if not name:
            continue
        inputs[f"lora_{index}"] = {"on": True, "lora": filename(name), "strength": strength}
        index += 1


def fill_txt2img(
    values: dict[str, Any],
    load_workflow: Callable[[str], dict[str, Any]],
    filename: Callable[[str], str],
    graph: Callable[[Any], dict[str, Any]],
) -> dict[str, Any]:
    lora_tags.apply(values)
    clip_prompt = lora_tags.strip_tags(str(values.get("prompt") or ""))
    clip_negative = lora_tags.strip_tags(str(values.get("negative_prompt") or ""))
    values["prompt_clip"] = clip_prompt
    values["negative_clip"] = clip_negative
    workflow = graph(copy.deepcopy(load_workflow(str(values.get("workflow") or "txt2img"))))
    positive_done = False
    batch_size = max(1, int(values.get("batch_size") or 1))
    for node in workflow.values():
        if not isinstance(node, dict):
            continue
        kind = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        title = str((node.get("_meta") or {}).get("title") or "").lower()
        if kind == "CheckpointLoaderSimple":
            inputs["ckpt_name"] = filename(str(values["checkpoint"]))
        elif kind == "UNETLoader":
            inputs["unet_name"] = filename(str(values.get("checkpoint") or ""))
        elif kind == "CLIPLoader":
            name = filename(str(values.get("text_encoder") or ""))
            if name:
                inputs["clip_name"] = name
        elif kind == "VAELoader":
            name = filename(str(values.get("vae") or ""))
            if name:
                inputs["vae_name"] = name
        elif kind == "CLIPTextEncode":
            if "negative" in title:
                inputs["text"] = clip_negative
            elif "positive" in title or not positive_done:
                inputs["text"] = clip_prompt
                positive_done = True
            else:
                inputs["text"] = clip_negative
        elif kind == "KSampler":
            inputs["seed"] = int(values["seed"])
            inputs["steps"] = int(values["steps"])
            inputs["cfg"] = float(values["cfg"])
            inputs["sampler_name"] = values["sampler"]
            inputs["scheduler"] = values["scheduler"]
        elif kind == "EmptyLatentImage":
            inputs["width"] = int(values["width"])
            inputs["height"] = int(values["height"])
            inputs["batch_size"] = batch_size
        elif kind == "SaveImage":
            prefix = str(values.get("filename_prefix") or "").strip() or "blombo"
            inputs["filename_prefix"] = prefix
        elif kind == "Power Lora Loader (rgthree)":
            fill_power_loras(inputs, values, filename)
    latent = workflow.get("7")
    if isinstance(latent, dict):
        latent.setdefault("inputs", {})["batch_size"] = batch_size
    return workflow
