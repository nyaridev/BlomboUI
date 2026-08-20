# BlomboUI

Forge / A1111-style GUI. ComfyUI stays the generation backend.

Root layout:

```text
BlomboUI/
├── webui-user.bat
├── webui.bat
├── comfyui.bat   # ComfyUI node editor (workflows)
├── install/      # ComfyUI, Python embed, Torch switch
├── app/          # source: API, web, workflows
├── runtime/      # downloads: Pythons, ComfyUI, sqlite, logs
└── user/
    ├── models/
    ├── output/
    ├── user_data/
    └── wildcards/
```

## Start (Windows)

1. Install [Node.js](https://nodejs.org/) LTS (needed for the Vite UI). Keep `node` and `npm` on PATH.
2. Optional: edit `webui-user.bat` (existing ComfyUI, models folder). Leave `PYTHON` unset.
3. Double-click `webui-user.bat`. First launch downloads Python 3.12 embed into `runtime\python_embeded`.
4. The launcher starts FastAPI (`http://127.0.0.1:4173`), Vite (`http://127.0.0.1:5173`), and the ComfyUI backend (`http://127.0.0.1:8188`, no node editor), then opens the UI in your browser.
5. First time only, if you want a bundled ComfyUI: run `install\install-comfyui.bat`.
6. Optional: pick a Torch build in `install\torch\` (ComfyUI Python only).
7. To build graphs in Comfy's own UI: close BlomboUI, then double-click `comfyui.bat`. Save (API Format) into `app\workflows\`.

If you already have ComfyUI, skip the Comfy installer and set `COMFYUI_PATH` in `webui-user.bat`. Models can stay in `.\user\models` or point at another folder with `MODELS_ROOT`.

Two Pythons on purpose: BlomboUI (FastAPI) never shares ComfyUI's Torch environment.
