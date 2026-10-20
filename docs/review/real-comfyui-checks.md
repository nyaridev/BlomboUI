# Real-ComfyUI checks: plan (waiting for the owner's OK)

Everything in BlomboUI has been checked against the fake ComfyUI and the fake Civitai. Only Phase 1
generated real images (SD 1.5 through the owner's ComfyUI). These checks need real downloads and a
real ComfyUI, so **nothing below has been run**. Sizes were read from the sources on 2026-10-20
(HEAD requests only, nothing downloaded).

## What changed since Phase 1

- The owner's install is no longer at `B:\AI\Diffusion\Interfaces\ComfyUI\ComfyUI-Easy-Install`
  (that folder now holds only `output_` and `output_comfy`). There's no managed slot in
  `runtime/comfyui/` either. `B:\AI\Diffusion\Models` still has no checkpoints.
- So there are two ways to get a ComfyUI:
  - **A (recommended): Blombo installs its own managed slot** into a throwaway `--runtime`. This is
    what the stage and batch Install buttons need anyway (packs and their Python packages go into
    the slot's own venv), and it also checks the in-app installer and the bridge's install-on-start.
    Nothing outside the temp folder is touched.
  - **B: the owner's own ComfyUI**, if it lives somewhere else now, run like in Phase 1: spare port,
    every writable folder in a temp dir, `--disable-all-custom-nodes`, `--database-url` to a temp
    SQLite. That can only cover checks without custom nodes (1 and 6 below): installing a pack's
    Python packages would change that install's environment, and blombo-bridge is a custom node.

## How it would run (option A)

1. A temp folder `A:\Projects\_\BlomboUI-new\runtime\check-real\` (inside the repo's gitignored
   `runtime/`, so it stays portable) with `data\`, `runtime\`, `models\`, `outputs\`, `inputs\`.
2. `node src/server/main.ts --dev --port 4391 --open none --data <tmp>\data --runtime <tmp>\runtime`
   and Vite on 4392, real Civitai not needed (`--civitai http://127.0.0.1:9`).
3. A throwaway profile pointing at `<tmp>\models`, `<tmp>\outputs`; Settings → ComfyUI → install a
   managed slot (CUDA). Models go into `<tmp>\models` through Models → Manager where the catalog has
   them (that also checks real downloads, resume and hash checks), otherwise by direct download.
4. After each check: note what passed; at the end stop ComfyUI and the server, compare
   `%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%\.cache` and `B:\AI\Diffusion` before and after (the
   final pass moved the libraries' caches into `runtime/cache/comfy/`; this proves it), then delete
   the temp folder.

ComfyUI listens on 127.0.0.1 only. No Civitai key is used.

## What would be downloaded

### The slot (option A only), about 2.9 GB

| What | Source | Size |
|---|---|---|
| ComfyUI, latest release source zip | github.com/comfyanonymous/ComfyUI (release archive) | about 10–20 MB |
| uv | github.com/astral-sh/uv releases | 14.5 MB |
| CPython 3.12 (through uv) | astral-sh/python-build-standalone | about 30 MB |
| PyTorch 2.11 CUDA 12.8 + torchvision + torchaudio | download.pytorch.org/whl/cu128 | 2,626 MB + about 15 MB |
| ComfyUI's requirements (frontend package, transformers, safetensors, …) | PyPI | about 250 MB |

### Per check

| # | Check | Packs (pinned) and their Python packages | Models | Download |
|---|---|---|---|---|
| 1 | Generate + Hires fix + the upscale batch | none | `v1-5-pruned-emaonly-fp16.safetensors` 2,034 MB (huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive); `4x-UltraSharp.pth` 63.9 MB (huggingface.co/Kim2091/UltraSharp) | 2.1 GB |
| 2 | ADetailer (face) | Impact Pack @429d0159, Impact Subpack @50c7b71a (GitHub zips, about 30 MB); ultralytics, segment-anything, **sam2 from git** (needs Git on PATH), transformers, opencv, scipy, scikit-image, matplotlib: about 400 MB | `face_yolov8m.pt` 49.6 MB (huggingface.co/Bingsu/adetailer); `sam_vit_b_01ec64.pth` 357.7 MB (dl.fbaipublicfiles.com, Meta) | about 0.85 GB |
| 3 | ControlNet (Canny, no preprocessor model) | comfyui_controlnet_aux @a587a4c1 (about 40 MB); onnxruntime-gpu, mediapipe, scikit-learn, trimesh, opencv, …: about 500 MB | `control_v11p_sd15_canny_fp16.safetensors` 689.1 MB (huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors) | about 1.2 GB |
| 4 | Caption and dataset prep batches | WD14 Tagger @9e0a6e70 (under 1 MB); onnxruntime about 15 MB | `wd-v1-4-moat-tagger-v2` model.onnx 311.1 MB + selected_tags.csv 0.2 MB (huggingface.co/SmilingWolf), fetched by the pack on first run | about 0.33 GB |
| 5 | Remove background batch | Inspyrenet Rembg @87ac452e (under 1 MB); transparent-background (+ timm, kornia): about 50 MB | InSPyReNet `ckpt_base.pth` about 370 MB, fetched by transparent-background on first run | about 0.42 GB |
| 6 | blombo-bridge in the real ComfyUI frontend (Edit in ComfyUI, Save to Blombo, Save as copy, Send to Blombo) | none (copied into the slot on start) | uses the model from check 1 | 0 |

**All of it: about 7.8 GB** (2.9 GB slot + 4.9 GB packs, packages and models), all inside the
temp folder and deleted afterwards. A smaller first round, checks 1, 4 and 6: about 5.3 GB.

## What each check proves

1. Real images through the queue with live progress, it/s per stage, Hires fix's second pass and
   the upscale batch's results; the gallery picks them up as they land.
2. Install from the ADetailer notice into the managed slot (pinned refs, uv, restart), then a face
   fix on a generated portrait; the dry-run check clears once the models are there.
3. The same for ControlNet with a gallery image as the control image and the Canny preprocessor.
4. Captions written as sidecar `.txt` next to copies of the input images, with the prefix.
5. Cut-outs written as PNGs into the output folder, inputs untouched.
6. The bridge bar appears in the real frontend, Save to Blombo reports changes, a primitive-fed
   seed isn't reported as changed (fixed in the final pass), Send to Blombo imports.

## Known risks

- Impact Pack's `sam2` comes from GitHub source: without Git the install fails with a pip error
  (Blombo shows it in the install log). That's a finding about the pack, not a reason to skip.
- First runs of checks 4 and 5 download weights from inside ComfyUI; their progress shows only in
  ComfyUI's log view.
- PyTorch 2.11 needs a recent NVIDIA driver for CUDA 12.8.
