<div align="center">

# BlomboUI

**An Automatic1111 / Forge-style GUI, with ComfyUI as the generation backend.**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-ASGI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![ComfyUI](https://img.shields.io/badge/Backend-ComfyUI-1F1F1F)](https://github.com/comfyanonymous/ComfyUI)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-informational)](#quick-start)

Thin desktop UI. Graphs stay in ComfyUI. Two Python environments on purpose: the app never shares Comfy’s Torch install.

[Quick Start](#quick-start) · [Features](#features) · [Layout](#layout) · [Config](#configuration) · [Stack](#stack)

</div>

---

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org/) LTS and [uv](https://docs.astral.sh/uv/) on `PATH`.

<table>
<tr>
<td width="50%" valign="top">

**Windows**

1. Optional: edit `webui-user.bat`
2. Double-click `webui-user.bat`

</td>
<td width="50%" valign="top">

**Linux**

1. Optional: edit `webui-user.sh`
2. Run `./webui-user.sh`

</td>
</tr>
</table>

First launch creates `runtime/.venv`, installs the frontend, and (if needed) clones ComfyUI into `runtime/comfyui` with its own embedded Python.

| Service | URL |
| --- | --- |
| UI | http://127.0.0.1:5173 |
| API | http://127.0.0.1:4173 |
| ComfyUI | http://127.0.0.1:8188 |

Already have ComfyUI? Set `COMFYUI_PATH` in `webui-user.bat` / `webui-user.sh`. Point models at another folder with `MODELS_ROOT`.

---

## Features

| | |
| --- | --- |
| **Generate** | txt2img-style workflow, LoRAs, wildcards, prompt matrix, templates |
| **Models** | local browser, Civitai download, thumbnails, scopes |
| **Gallery** | output browser, PNG info, file ops |
| **Wildcards** | YAML / text editors with tree + fold |
| **Workflows** | Comfy graphs in `app/workflows/main/` (API + droppable `*_raw.json`); optional stages in `app/workflows/utils/`. See [docs/workflows.md](docs/workflows.md). |

---

## Layout

```text
BlomboUI/
├── webui-user.bat / .sh     ← start here (flags & paths)
├── install/
│   ├── webui.bat / .sh      launcher
│   ├── comfyui.bat / .sh    ComfyUI (node editor or headless)
│   ├── windows/             Git, uv venv, ComfyUI, Torch
│   └── linux/
├── app/                     backend, frontend, workflows
├── runtime/                 .venv, ComfyUI, launcher cache, logs
└── user/                    created on first launch (models, output, data, wildcards)
```

---

## Configuration

Edit `webui-user.bat` or `webui-user.sh`. Do not edit the files under `install/` unless you are changing how the app launches.

### Paths

| Variable | Default |
| --- | --- |
| `COMFYUI_PATH` | `runtime/comfyui/ComfyUI` |
| `MODELS_ROOT` | `./user/models` |
| `OUTPUTS_ROOT` | `./user/output` |
| `WILDCARDS_ROOT` | `./user/wildcards` |
| `VENV_DIR` | `runtime/.venv` |

### App flags (`COMMANDLINE_ARGS`)

| Flag | Effect |
| --- | --- |
| `--uv` | use uv for the project environment (always used by the installer) |
| `--port N` | UI port (default `5173`) |
| `--hot_reload_vite` | reload the frontend when UI files change |
| `--comfyui-window` | start ComfyUI in a separate console |
| `--dev_debug` | show Comfy setup and startup logs |
| `--api-pings` | show backend access logs |

### ComfyUI (`COMFYUI_ARGS`)

Forwarded to ComfyUI `main.py` (port, listen, extra switches). Example: `--port 8189`.

### Torch

Optional CUDA builds live in `install/windows/torch` and `install/linux/torch`. They only touch ComfyUI’s Python, never `runtime/.venv`.

### Comfy node editor

Close BlomboUI, then run `install/comfyui.bat` or `install/comfyui.sh`. Save the UI workflow as `name_raw.json` and **API Format** as `name.json` under `app/workflows/main/` (or `utils/` for extras). See [docs/workflows.md](docs/workflows.md).

---

## Stack

| Layer | Tech |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, Tailwind 4, Zustand |
| API | Python 3.12+, FastAPI, Uvicorn, SQLite |
| Generate | ComfyUI (separate Python + Torch) |
| Install | uv, Node.js / npm |
