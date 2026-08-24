# BlomboUI

Forge / A1111-style GUI. ComfyUI stays the generation backend.

Root layout:

```text
BlomboUI/
├── webui-user.bat / webui-user.sh   # start here (settings + flags)
├── install/
│   ├── webui.bat / webui.sh         # launcher
│   ├── comfyui.bat / comfyui.sh     # ComfyUI node editor (or backend-only)
│   ├── windows/                     # Git, uv venv, ComfyUI, Torch
│   └── linux/
├── app/                             # source: API, web, workflows
├── runtime/                         # .venv, ComfyUI, sqlite, logs
└── user/
    ├── models/
    ├── output/
    ├── user_data/
    └── wildcards/
```

## Start

1. Install [Node.js](https://nodejs.org/) LTS and [uv](https://docs.astral.sh/uv/). Keep `node`, `npm`, and `uv` on PATH.
2. Optional: edit `webui-user.bat` or `webui-user.sh` (`COMFYUI_PATH`, `MODELS_ROOT`, `COMMANDLINE_ARGS`).
3. Double-click `webui-user.bat` (Windows) or run `./webui-user.sh` (Linux).
4. First launch creates `runtime/.venv` with uv, installs frontend deps, and if needed clones ComfyUI into `runtime/comfyui` with its own `python_embeded`.
5. FastAPI listens on `http://127.0.0.1:4173`, Vite on `http://127.0.0.1:5173`, ComfyUI on `http://127.0.0.1:8188`.
6. Optional: pick a Torch build in `install/windows/torch` or `install/linux/torch` (ComfyUI Python only).
7. To build graphs in Comfy's own UI: close BlomboUI, then run `install/comfyui.bat` or `install/comfyui.sh`. Save (API Format) into `app/workflows/`.

If you already have ComfyUI, set `COMFYUI_PATH` in `webui-user.bat` / `.sh`. Models can stay in `./user/models` or point at another folder with `MODELS_ROOT`.

Two Pythons on purpose: BlomboUI (uv `.venv`) never shares ComfyUI's Torch environment.
