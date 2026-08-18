# BlomboUI

Forge / A1111-style GUI. ComfyUI stays the generation backend.

Root layout:

```text
BlomboUI/
├── webui-user.bat
├── webui.bat
├── install/      # ComfyUI, Python embed, Torch switch
├── app/          # source: API, web, workflows
├── runtime/      # downloads: Pythons, ComfyUI, sqlite, logs
└── user/
    ├── models/
    ├── output/
    ├── gallery/
    └── wildcards/
```

## Start (Windows)

1. Optional: edit `webui-user.bat` (existing ComfyUI, models folder). Leave `PYTHON` unset.
2. Double-click `webui-user.bat`. First launch downloads Python 3.12 embed into `runtime\python_embeded`.
3. First time only, if you want a bundled ComfyUI: run `install\install-comfyui.bat`.
4. Optional: pick a Torch build in `install\torch\` (ComfyUI Python only).

If you already have ComfyUI, skip the Comfy installer and set `COMFYUI_PATH` in `webui-user.bat`. Models can stay in `.\user\models` or point at another folder with `MODELS_ROOT`.

Two Pythons on purpose: BlomboUI (FastAPI) never shares ComfyUI's Torch environment.

App servers (FastAPI + Vite) are the next implementation step.
