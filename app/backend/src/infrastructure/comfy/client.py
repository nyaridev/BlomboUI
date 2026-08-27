from __future__ import annotations

import json
import os
import struct
import subprocess
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from config import WORKFLOWS, comfy_base
from shared import dirs
from features.generate.scripts.comfy_fill import fill_power_loras, fill_txt2img as fill_workflow

TIMEOUT = 30
PREVIEW_IMAGE = 1
PREVIEW_IMAGE_WITH_METADATA = 4
_SMI_TTL = 2.0
OnEvent = Callable[[dict[str, Any]], None]
_smi_lock = threading.Lock()
_smi_cache: tuple[float, dict[str, Any]] | None = None


class ComfyError(Exception):
    def __init__(self, code: str, message: str, status: int = 503) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def _request(method: str, path: str, body: bytes | None = None, timeout: float = TIMEOUT) -> bytes:
    headers = {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(comfy_base() + path, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as res:
            return res.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise ComfyError("job_failed", f"ComfyUI HTTP {exc.code}: {detail}", status=502) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise ComfyError(
            "comfy_unreachable",
            f"ComfyUI is not running on {comfy_base()}",
        ) from exc


def reachable() -> bool:
    return system_stats() is not None


def system_stats() -> dict[str, Any] | None:
    try:
        raw = _request("GET", "/system_stats", timeout=1.5)
        data = json.loads(raw.decode("utf-8"))
    except (ComfyError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def gpu_stats() -> dict[str, Any]:
    smi = gpu_smi()
    stats = system_stats()
    used = total = 0
    if stats:
        devices = stats.get("devices")
        rows = devices if isinstance(devices, list) else []
        picked: dict[str, Any] | None = None
        for item in rows:
            if isinstance(item, dict) and str(item.get("type") or "").lower() == "cuda":
                picked = item
                break
        if picked is None:
            picked = next((item for item in rows if isinstance(item, dict)), None)
        if picked:
            total = int(picked.get("vram_total") or 0)
            free = int(picked.get("vram_free") or 0)
            used = max(0, total - free)
    return {
        "reachable": stats is not None,
        "vram_used": used,
        "vram_total": total,
        "temp_c": smi.get("temp_c"),
    }


def gpu_smi() -> dict[str, Any]:
    global _smi_cache
    now = time.monotonic()
    cached = _smi_cache
    if cached and now - cached[0] < _SMI_TTL:
        return cached[1]
    with _smi_lock:
        cached = _smi_cache
        if cached and now - cached[0] < _SMI_TTL:
            return cached[1]
        data = _query_smi()
        _smi_cache = (time.monotonic(), data)
        return data


def _query_smi() -> dict[str, Any]:
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            timeout=1.5,
            text=True,
            errors="ignore",
            creationflags=flags,
        )
    except (OSError, subprocess.SubprocessError):
        return {}
    line = (out.strip().splitlines() or [""])[0].strip()
    try:
        return {"temp_c": int(float(line))}
    except ValueError:
        return {}


def free(unload_models: bool = False, free_memory: bool = False) -> None:
    payload = json.dumps({"unload_models": unload_models, "free_memory": free_memory}).encode("utf-8")
    _request("POST", "/free", payload, timeout=30)


def _combo(info: dict[str, Any], node: str, name: str) -> list[str]:
    required = ((info.get(node) or {}).get("input") or {}).get("required") or {}
    spec = required.get(name)
    if not isinstance(spec, list) or not spec or not isinstance(spec[0], list):
        return []
    return [str(item) for item in spec[0] if isinstance(item, (str, int, float))]


def ksampler_choices() -> dict[str, list[str]]:
    raw = _request("GET", "/object_info/KSampler", timeout=5)
    info = json.loads(raw.decode("utf-8"))
    if not isinstance(info, dict):
        return {"samplers": [], "schedulers": []}
    return {
        "samplers": _combo(info, "KSampler", "sampler_name"),
        "schedulers": _combo(info, "KSampler", "scheduler"),
    }


def warmup_model_lists(kind: str | None = None) -> None:
    if not reachable():
        return
    folders = ("checkpoints", "loras", "vae", "controlnet", "embeddings", "diffusion_models", "text_encoders", "upscale_models")
    if kind:
        folders = (kind,) if kind in folders else ()
    for folder in folders:
        try:
            _request("GET", f"/models/{folder}", timeout=5)
        except ComfyError:
            continue


def _comfy_graph(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    return {key: node for key, node in data.items() if isinstance(node, dict) and node.get("class_type")}


def _workflow_nodes(data: Any) -> list:
    return list(_comfy_graph(data).values())


def _workflow_category(data: Any) -> str:
    kinds = {node.get("class_type") for node in _workflow_nodes(data)}
    if kinds & {"VHS_VideoCombine", "SaveVideo", "ImageToVideo"}:
        return "video"
    if kinds & {"SaveImage", "PreviewImage", "EmptyLatentImage", "VAEDecode"}:
        return "image"
    return "utility"


def _workflow_params(data: Any) -> list[str]:
    keys: set[str] = set()
    clips = 0
    for node in _workflow_nodes(data):
        kind = str(node.get("class_type") or "")
        title = str((node.get("_meta") or {}).get("title") or "").lower()
        if "hires" in title:
            if kind == "ImageUpscaleWithModel" or "KSampler" in kind:
                keys.add("hires")
            continue
        if kind in {"CheckpointLoaderSimple", "UNETLoader"}:
            keys.add("checkpoint")
        elif kind == "CLIPLoader":
            keys.add("textEncoder")
        elif kind == "VAELoader":
            keys.add("vae")
        elif kind == "CLIPTextEncode":
            clips += 1
            if "negative" in title:
                keys.add("negativePrompt")
            else:
                keys.add("prompt")
        elif "KSampler" in kind:
            keys.update({"seed", "steps", "cfg", "sampler", "scheduler"})
            if "hires" in title:
                keys.add("hires")
        elif kind == "EmptyLatentImage":
            keys.update({"width", "height", "batchSize"})
        elif kind == "Power Lora Loader (rgthree)":
            keys.add("loras")
        elif kind == "ImageUpscaleWithModel":
            keys.add("hires")
    if clips >= 2:
        keys.update({"prompt", "negativePrompt"})
    return sorted(keys)


def list_workflows() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not WORKFLOWS.is_dir():
        return items
    for path in sorted(WORKFLOWS.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        items.append(
            {
                "id": path.stem,
                "name": path.stem,
                "category": _workflow_category(data),
                "params": _workflow_params(data),
            }
        )
    return items


def load_workflow(name: str) -> dict[str, Any]:
    stem = Path(name).stem
    if not stem or stem in {".", ".."}:
        raise ComfyError("not_found", "workflow not found", status=404)
    path = WORKFLOWS / f"{stem}.json"
    if not path.is_file():
        raise ComfyError("not_found", f"workflow not found: {stem}", status=404)
    return json.loads(path.read_text(encoding="utf-8"))


def comfy_filename(name: str) -> str:
    parts = [part for part in str(name or "").replace("\\", "/").split("/") if part and part not in {".", ".."}]
    extras = dirs.extra_named("modelDirs")
    if parts and parts[0] in extras:
        parts = parts[1:]
    return os.sep.join(parts)


def _fill_power_loras(inputs: dict[str, Any], values: dict[str, Any]) -> None:
    fill_power_loras(inputs, values, comfy_filename)


def fill_txt2img(values: dict[str, Any]) -> dict[str, Any]:
    return fill_workflow(values, load_workflow, comfy_filename, _comfy_graph)


def submit_prompt(graph: dict[str, Any], client_id: str) -> str:
    payload = json.dumps(
        {
            "prompt": graph,
            "client_id": client_id,
            "extra_data": {"preview_method": "latent2rgb"},
        }
    ).encode("utf-8")
    raw = _request("POST", "/prompt", payload)
    data = json.loads(raw.decode("utf-8"))
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        raise ComfyError("job_failed", f"ComfyUI did not return a prompt id: {data}", status=502)
    return str(prompt_id)


def history(prompt_id: str) -> dict[str, Any]:
    raw = _request("GET", f"/history/{prompt_id}", timeout=5)
    data = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, dict) else {}


def output_images(entry: dict[str, Any]) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    outputs = entry.get("outputs") or {}
    if not isinstance(outputs, dict):
        return found
    for node_id, node_out in outputs.items():
        if not isinstance(node_out, dict):
            continue
        images = node_out.get("images") or []
        for image in images:
            if not isinstance(image, dict) or not image.get("filename"):
                continue
            kind = str(image.get("type") or "output")
            if kind != "output":
                continue
            found.append(
                {
                    "filename": str(image["filename"]),
                    "subfolder": str(image.get("subfolder") or ""),
                    "type": kind,
                    "node": str(node_id),
                }
            )
    return found


def _prompt_finished(entry: dict[str, Any]) -> bool:
    status = entry.get("status") or {}
    if status.get("completed") is True:
        return True
    return str(status.get("status_str") or "") in {"success", "error", "interrupted"}


def _was_interrupted(entry: dict[str, Any]) -> bool:
    status = entry.get("status") or {}
    if str(status.get("status_str") or "") == "interrupted":
        return True
    for msg in status.get("messages") or []:
        if "interrupt" in str(msg).lower():
            return True
    return False


def interrupt() -> None:
    _request("POST", "/interrupt", b"{}", timeout=5)


def download_image(info: dict[str, str]) -> bytes:
    qs = urlencode(
        {
            "filename": info["filename"],
            "subfolder": info["subfolder"],
            "type": info["type"],
        }
    )
    return _request("GET", f"/view?{qs}", timeout=60)


def wait_for_images(prompt_id: str, timeout_s: float = 600) -> list[dict[str, str]]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        hist = history(prompt_id)
        entry = hist.get(prompt_id) if prompt_id in hist else (next(iter(hist.values()), None) if hist else None)
        if isinstance(entry, dict):
            if _was_interrupted(entry):
                return []
            status = entry.get("status") or {}
            if str(status.get("status_str") or "") == "error":
                msgs = status.get("messages") or []
                raise ComfyError("job_failed", f"ComfyUI job error: {msgs}", status=502)
            if _prompt_finished(entry):
                return output_images(entry)
        time.sleep(0.4)
    raise ComfyError("job_failed", "Timed out waiting for ComfyUI output", status=504)


def _parse_preview(blob: bytes) -> bytes | None:
    if len(blob) < 8:
        return None
    event = struct.unpack(">I", blob[:4])[0]
    rest = blob[4:]
    if event == PREVIEW_IMAGE:
        return rest[4:] if len(rest) > 4 else None
    if event == PREVIEW_IMAGE_WITH_METADATA:
        meta_len = struct.unpack(">I", rest[:4])[0]
        start = 4 + meta_len
        return rest[start:] if len(rest) > start else None
    return None


def _history_entry(prompt_id: str) -> dict[str, Any] | None:
    hist = history(prompt_id)
    entry = hist.get(prompt_id) if prompt_id in hist else (next(iter(hist.values()), None) if hist else None)
    return entry if isinstance(entry, dict) else None


def _finish_from_history(prompt_id: str) -> list[dict[str, str]]:
    entry = _history_entry(prompt_id)
    if not entry:
        return wait_for_images(prompt_id)
    if _was_interrupted(entry):
        return []
    status = entry.get("status") or {}
    if str(status.get("status_str") or "") == "error":
        msgs = status.get("messages") or []
        raise ComfyError("job_failed", f"ComfyUI job error: {msgs}", status=502)
    images = output_images(entry)
    if images:
        return images
    return wait_for_images(prompt_id)


def run_prompt(graph: dict[str, Any], client_id: str, on_event: OnEvent, timeout_s: float = 600) -> tuple[str, list[dict[str, str]]]:
    try:
        from websockets.sync.client import connect
    except ImportError:
        prompt_id = submit_prompt(graph, client_id)
        on_event({"prompt_id": prompt_id})
        return prompt_id, wait_for_images(prompt_id, timeout_s)

    parsed = urlparse(comfy_base())
    ws_url = f"ws://{parsed.hostname}:{parsed.port}/ws?clientId={client_id}"
    try:
        ws_cm = connect(ws_url, open_timeout=10, max_size=8_000_000)
    except Exception:
        prompt_id = submit_prompt(graph, client_id)
        on_event({"prompt_id": prompt_id})
        return prompt_id, wait_for_images(prompt_id, timeout_s)

    prompt_id = ""
    with ws_cm as ws:
        prompt_id = submit_prompt(graph, client_id)
        on_event({"prompt_id": prompt_id})
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            try:
                raw = ws.recv(timeout=1)
            except TimeoutError:
                entry = _history_entry(prompt_id)
                if isinstance(entry, dict) and _prompt_finished(entry):
                    return prompt_id, _finish_from_history(prompt_id)
                continue
            except Exception:
                return prompt_id, wait_for_images(prompt_id, max(1.0, deadline - time.monotonic()))
            if isinstance(raw, bytes):
                preview = _parse_preview(raw)
                if preview:
                    on_event({"preview": preview})
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            data = msg.get("data") or {}
            if data.get("prompt_id") and data.get("prompt_id") != prompt_id:
                continue
            kind = msg.get("type")
            if kind == "progress":
                node = data.get("node")
                on_event({"value": data.get("value"), "max": data.get("max"), "node": None if node is None else str(node)})
            elif kind == "execution_error":
                raise ComfyError("job_failed", f"ComfyUI job error: {data}", status=502)
            elif kind == "execution_interrupted":
                return prompt_id, []
            elif kind == "executing":
                node = data.get("node")
                if node is None:
                    return prompt_id, _finish_from_history(prompt_id)
                on_event({"node": str(node)})
    raise ComfyError("job_failed", "Timed out waiting for ComfyUI output", status=504)
