# install

Installer bats. Launch bats stay at the repo root (`webui-user.bat`, `comfyui.bat`).

| File | What it installs |
| --- | --- |
| `install-comfyui.bat` | Git (if needed), ComfyUI, Comfy Python 3.12 embed, Torch, ComfyUI-Manager |
| `install-python.bat` | BlomboUI Python embed (`runtime\python_embeded`). Also called by `webui.bat` |
| `torch\*.bat` | Swap Torch inside **ComfyUI's** Python only |
| `_ui.bat` | Shared console colors, sections, downloads |
| `_download.ps1` | Solid tqdm-style download bar (used by `_ui.bat`) |
| `_embed.bat` | Shared Python 3.12 embed + pip + uv bootstrap |

## Torch switch

Double-click one file after ComfyUI is installed:

- `Torch 2.7.1+cu128.bat`
- `Torch 2.8.0+cu128.bat`
- `Torch 2.9.1+cu130.bat`
- `Torch 2.10.0+cu130 (default).bat`

CUDA 13 packs refuse to run if the NVIDIA driver is below 580. They do not touch `runtime\python_embeded` (the GUI Python).
