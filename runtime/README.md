# runtime

Downloaded and generated files. Not source. Gitignored except this README.

```text
runtime/
├── python_embeded/     # BlomboUI Python 3.12 (webui.bat)
├── comfy/
│   ├── python_embeded/ # ComfyUI Python + Torch (install\install-comfyui.bat)
│   └── ComfyUI/
├── data/               # sqlite, launcher-env, extra_model_paths
├── tmp/
└── venv/               # only if PYTHON is overridden
```

`app/` stays code: FastAPI, React, workflows, launch scripts.
