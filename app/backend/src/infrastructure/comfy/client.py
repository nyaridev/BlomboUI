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
from features.generate.scripts.workflow.comfy_fill import fill_power_loras, fill_txt2img as fill_workflow

TIMEOUT = 30
PREVIEW_IMAGE = 1
PREVIEW_IMAGE_WITH_METADATA = 4
_SMI_TTL = 2.0
_STATS_TTL = 8.0
_STATS_TIMEOUT = 5.0
OnEvent = Callable[[dict[str, Any]], None]
_smi_lock = threading.Lock()
_smi_cache: tuple[float, dict[str, Any]] | None = None
_stats_lock = threading.Lock()
_stats_cache: tuple[float, dict[str, Any]] | None = None
_MODEL_FOLDERS = (
    "checkpoints",
    "loras",
    "vae",
    "controlnet",
    "embeddings",
    "diffusion_models",
    "text_encoders",
    "upscale_models",
    "sams",
    "ultralytics",
)
_names_lock = threading.Lock()
_model_names: dict[str, list[str]] = {}


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
    global _stats_cache
    now = time.monotonic()
    data: dict[str, Any] | None = None
    try:
        raw = _request("GET", "/system_stats", timeout=_STATS_TIMEOUT)
        parsed = json.loads(raw.decode("utf-8"))
        if isinstance(parsed, dict):
            data = parsed
            with _stats_lock:
                _stats_cache = (now, data)
            return data
    except (ComfyError, json.JSONDecodeError):
        pass
    cached = _stats_cache
    if cached and now - cached[0] < _STATS_TTL:
        return cached[1]
    return None


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


def clip_loader_choices() -> dict[str, list[str]]:
    try:
        raw = _request("GET", "/object_info/CLIPLoader", timeout=5)
    except ComfyError:
        return {"types": [], "devices": []}
    info = json.loads(raw.decode("utf-8"))
    if not isinstance(info, dict):
        return {"types": [], "devices": []}
    return {
        "types": _combo(info, "CLIPLoader", "type"),
        "devices": _combo(info, "CLIPLoader", "device"),
    }


def warmup_model_lists(kind: str | None = None) -> None:
    if not reachable():
        return
    folders = _MODEL_FOLDERS
    if kind:
        folders = (kind,) if kind in _MODEL_FOLDERS else ()
    for folder in folders:
        _fetch_model_list(folder)


def _parse_model_list(raw: bytes) -> list[str]:
    try:
        data = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data if isinstance(item, (str, int, float))]


def _fetch_model_list(folder: str) -> list[str]:
    try:
        rows = _parse_model_list(_request("GET", f"/models/{folder}", timeout=5))
    except ComfyError:
        rows = []
    with _names_lock:
        _model_names[folder] = rows
    return rows


def _ensure_model_names() -> dict[str, list[str]]:
    with _names_lock:
        if _model_names:
            return {folder: list(rows) for folder, rows in _model_names.items()}
    if not reachable():
        return {}
    for folder in _MODEL_FOLDERS:
        _fetch_model_list(folder)
    with _names_lock:
        return {folder: list(rows) for folder, rows in _model_names.items()}


_SLASH_FOLDERS = {"ultralytics", "sams"}


def _listed_name(wanted: str) -> str | None:
    key = wanted.replace("\\", "/")
    if not key:
        return None
    for folder, rows in _ensure_model_names().items():
        for item in rows:
            raw = str(item)
            if raw.replace("\\", "/") != key:
                continue
            return raw.replace("\\", "/") if folder in _SLASH_FOLDERS else raw
    return None


def _comfy_graph(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        return {}
    return {key: node for key, node in data.items() if isinstance(node, dict) and node.get("class_type")}


def _workflow_nodes(data: Any) -> list:
    return list(_comfy_graph(data).values())


def _workflow_category(data: Any) -> str:
    if isinstance(data, dict):
        raw = str(data.get("category") or "").strip()
        if raw in {"image", "video", "utility"}:
            return raw
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
        if title.startswith("port:") or "hires" in title:
            if "hires" in title and (kind == "ImageUpscaleWithModel" or "KSampler" in kind):
                keys.add("hires")
            continue
        if kind in {"CheckpointLoaderSimple", "UNETLoader", "UnetLoaderGGUF"}:
            keys.add("checkpoint")
        elif kind in {"CLIPLoader", "CLIPLoaderGGUF", "DualCLIPLoader", "DualCLIPLoaderGGUF", "TripleCLIPLoader", "TripleCLIPLoaderGGUF"}:
            keys.add("textEncoder")
            if kind in {"CLIPLoader", "CLIPLoaderGGUF"}:
                keys.update({"clipType", "clipDevice"})
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
        elif kind == "CLIPSetLastLayer":
            keys.add("clipSkip")
        elif kind in {"RMBG", "BiRefNetRMBG"}:
            keys.add("rembg")
    if clips >= 2:
        keys.update({"prompt", "negativePrompt"})
    extras = data.get("extras") if isinstance(data, dict) else None
    if isinstance(extras, list):
        keys.update(str(item) for item in extras if item)
    return sorted(keys)


def _workflow_defaults(data: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for node in _workflow_nodes(data):
        kind = str(node.get("class_type") or "")
        title = str((node.get("_meta") or {}).get("title") or "").lower()
        if title.startswith("port:") or "hires" in title:
            continue
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        if kind == "KSampler":
            try:
                out["steps"] = int(inputs.get("steps"))
            except (TypeError, ValueError):
                pass
            try:
                cfg = float(inputs.get("cfg"))
            except (TypeError, ValueError):
                cfg = None
            if cfg is not None and 1 <= cfg <= 30:
                out["cfg"] = cfg
            sampler = inputs.get("sampler_name")
            if isinstance(sampler, str) and sampler:
                out["sampler"] = sampler
            scheduler = inputs.get("scheduler")
            if isinstance(scheduler, str) and scheduler:
                out["scheduler"] = scheduler
        elif kind == "EmptyLatentImage":
            try:
                width = int(inputs.get("width"))
                height = int(inputs.get("height"))
            except (TypeError, ValueError):
                continue
            if width >= 64:
                out["width"] = width
            if height >= 64:
                out["height"] = height
        elif kind in {"CLIPLoader", "CLIPLoaderGGUF"}:
            clip_type = inputs.get("type")
            if isinstance(clip_type, str) and clip_type:
                out["clipType"] = clip_type
            device = inputs.get("device")
            if isinstance(device, str) and device:
                out["clipDevice"] = device
        elif kind == "CLIPSetLastLayer":
            try:
                layer = abs(int(inputs.get("stop_at_clip_layer") or 2))
            except (TypeError, ValueError):
                layer = 2
            out["clipSkip"] = max(1, min(10, layer))
    extra = data.get("defaults") if isinstance(data, dict) else None
    if isinstance(extra, dict):
        mode = extra.get("resMode")
        if mode in {"raw", "scaler", "set"}:
            out["resMode"] = mode
        aspect = extra.get("aspect")
        if isinstance(aspect, str) and aspect.strip():
            out["aspect"] = aspect.strip()
        try:
            megapixels = float(extra.get("megapixels"))
        except (TypeError, ValueError):
            megapixels = None
        if megapixels is not None and 0.2 <= megapixels <= 4:
            out["megapixels"] = megapixels
    return out


_FAMILIES = ("image_checkpoint", "image_diffusion")
_PICKERS = (*_FAMILIES, "utils")


def workflow_file(stem: str) -> Path | None:
    ident = Path(stem).stem
    if not ident or ident in {".", ".."} or ident.endswith("_raw"):
        return None
    for folder in _PICKERS:
        path = WORKFLOWS / folder / f"{ident}.json"
        if path.is_file():
            return path
    return None


def list_workflows() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for folder in _PICKERS:
        folder = WORKFLOWS / folder
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.json")):
            if path.stem.endswith("_raw"):
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                data = {}
            label = ""
            if isinstance(data, dict):
                label = str(data.get("name") or "").strip()
            items.append(
                {
                    "id": path.stem,
                    "name": label or path.stem,
                    "category": _workflow_category(data),
                    "params": _workflow_params(data),
                    "defaults": _workflow_defaults(data),
                }
            )
    items.sort(key=lambda row: str(row["id"]))
    return items


def load_workflow(name: str) -> dict[str, Any]:
    path = workflow_file(name)
    if path is None:
        stem = Path(name).stem
        raise ComfyError("not_found", f"workflow not found: {stem}", status=404)
    return json.loads(path.read_text(encoding="utf-8"))


def comfy_filename(name: str) -> str:
    parts = [part for part in str(name or "").replace("\\", "/").split("/") if part and part not in {".", ".."}]
    extras = dirs.extra_named("modelDirs")
    if parts and parts[0] in extras:
        parts = parts[1:]
    joined = "/".join(parts)
    return _listed_name(joined) or joined


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
