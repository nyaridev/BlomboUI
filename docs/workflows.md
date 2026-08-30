# Workflows

BlomboUI is a thin GUI over ComfyUI. Graphs live in [`app/workflows/`](../app/workflows/). The Generate picker lists **family mains**. Nested **utils** are fragments composed onto a main at fill time (Hires.fix, ADetailer).

This is compose + fill, not a plugin loader and not “paste any Comfy URL and chrome appears”. Video, dataset, and multi-image jobs still need UI when they leave the image param set.

## Layout

```text
app/workflows/
  image_checkpoint/             # picker mains (CheckpointLoaderSimple)
    sd15.json, sdxl.json, illustrious.json, noobai.json
    utils/
      hiresfix.json
      adetailer.json
  image_diffusion/              # picker mains (UNET + CLIP + VAE)
    anima.json
    krea2.json
    utils/
      hiresfix.json
      adetailer.json
  utils/                        # picker utilities (not compose fragments)
    background_removal.json
    image_upscale.json
```

Each `name.json` keeps `name_raw.json` beside it.

| Folder | Role |
| --- | --- |
| `image_checkpoint/` | Checkpoint family. Stem of `name.json` is the workflow id (`sd15`, `sdxl`, …). |
| `image_diffusion/` | Diffusion family (`anima`, `krea2`). |
| `utils/` | Standalone picker utilities (`background_removal`, `image_upscale`). Listed like a main. |
| `<family>/utils/` | Optional stages. Attached when an extra is on (`hires`, `adetailer`). Never listed. |

`*_raw.json` is never loaded by the app. First launch defaults to **SD 1.5** (`sd15`).

## Two JSON formats

Comfy’s canvas does **not** load API prompt JSON (`{"1": {"class_type": ...}}`). Dropping that on the graph does nothing useful.

| File | Format | Who uses it |
| --- | --- | --- |
| `name.json` | API prompt (`class_type` + `inputs`) plus Blombo meta | fill → Comfy `/prompt` |
| `name_raw.json` | UI workflow (`nodes`, `links`, `version`) | drop onto the Comfy canvas |

### Authoring loop

1. Close BlomboUI and run `install/comfyui.bat` or `install/comfyui.sh`.
2. Build or edit the graph in Comfy.
3. **File → Save** → `app/workflows/image_checkpoint/name_raw.json` (or `image_diffusion/`, `utils/` for picker utilities, or that family’s `utils/` for extras).
4. Enable dev options → **Save (API Format)** → same folder, `name.json` (same stem, no `_raw`).
5. Add Blombo meta on the API file only. Keep `PORT:*` titles intact on utils.

The `_raw.json` files in the repo were generated from the API graphs (grid layout). After you save from Comfy, that export replaces the generated raw.

## Main meta

Top-level keys next to nodes (stripped before `/prompt`):

```json
{
  "apply": ["sampler", "scheduler", "steps", "cfg", "seed", "outputPath"],
  "extras": ["hires"],
  "ports": {
    "IMAGE": ["9", 0],
    "MODEL": ["12", 0],
    "CLIP": ["12", 1],
    "VAE": ["1", 2],
    "POSITIVE": ["2", 0],
    "NEGATIVE": ["3", 0]
  }
}
```

| Key | Meaning |
| --- | --- |
| `apply` | Template default-apply fields. Skip prompt and model ids. |
| `extras` | Extra ids the Generate extras panel may show (`hires`). Unioned into `GET /api/workflows` `params`. |
| `ports` | Host sockets utils wire to. `[node_id, output_slot]`. |

Params such as `checkpoint`, `vae`, `textEncoder`, `clipType`, `clipDevice`, `clipSkip`, `seed` are also inferred from node types. Declare `extras` for anything that is **not** in the main graph (hires lives in `utils/`).

## Utils and ports

A util is a valid Comfy graph. Inputs are stub nodes titled `PORT:NAME`. Compose remaps ids (`hires/12`), replaces stubs with the host `ports`, deletes the stubs, and points the host **Save Image** (not Save First Pass) at the util output.

| Title | Typical node | Host port |
| --- | --- | --- |
| `PORT:IMAGE` | `LoadImage` | first-pass decode |
| `PORT:MODEL` | loader with a MODEL output | LoRA / UNET / checkpoint MODEL |
| `PORT:CLIP` | `CLIPLoader` | CLIP |
| `PORT:VAE` | `VAELoader` | VAE |
| `PORT:POSITIVE` | `CLIPTextEncode` | positive conditioning |
| `PORT:NEGATIVE` | `CLIPTextEncode` | negative conditioning |

Util meta:

```json
{
  "attach": "after_decode",
  "ports": { "IMAGE": ["12", 0] }
}
```

`attach` is the splice point (`after_decode` now; `before_sampler` later for ControlNet). `ports.IMAGE` is the util’s output node after remap.

Keep real work-node titles containing `Hires` (or the extra name) so fill can find them. Do not put `PORT:` on those.

Hires variants are picked from `hires.kind` in [`compose.py`](../app/backend/src/features/generate/scripts/compose.py):

```text
HIRES_UTILS = {
  "checkpoints": ("image_checkpoint", "hiresfix"),
  "diffusion_models": ("image_diffusion", "hiresfix"),
}
```

Same pattern for ADetailer (`adetailer.json` under each family’s `utils/`).

## Adding a main (Flux, Wan, LTX, K2, …)

1. Pair of files in `app/workflows/image_checkpoint/` or `image_diffusion/` (`flux.json` + `flux_raw.json`).
2. Restart / reload workflows. The picker lists it; no Python list to edit.
3. Set `apply`, `ports` if utils should attach, `extras` for extras the main supports.
4. Use node types the fill loop already understands (`CheckpointLoaderSimple`, `UNETLoader`, `CLIPLoader`, `VAELoader`, `KSampler`, `EmptyLatentImage`, `CLIPTextEncode`, `CLIPSetLastLayer`, `Power Lora Loader (rgthree)`, `SaveImage`) — or extend [`comfy_fill.py`](../app/backend/src/features/generate/scripts/comfy_fill.py) for new class types.
5. Add a Generate extras body only when inferred params are not enough (new widgets, not a new theme).
6. Custom nodes must be installed in the managed Comfy. Missing nodes fail at submit.

A first-pass-only graph is enough. Optional stages stay in that family’s `utils/` and attach through `extras` + compose. Standalone picker utilities (Background Removal) go in `app/workflows/utils/`.

## Adding a util (ADetailer, ControlNet, SeedVR2, dataset crop, …)

1. Pair of files in `app/workflows/<family>/utils/`.
2. PORT stubs + `attach` + output `ports`.
3. One compose call when the extra is enabled (copy the `apply_hires` pattern in [`comfy_fill.py`](../app/backend/src/features/generate/scripts/comfy_fill.py)).
4. Job field + extras UI body (Hires.fix is the template: store blob, `GenerationExtras`, fill/rewire).
5. Progress stages: title or `class_type` in `node_progress_stage` if the extra should show its own segment.

ControlNet splices **before** the first sampler (CONDITIONING), not after decode. Set `attach` accordingly and teach compose that attach; do not force it through `IMAGE`.

Chaining later: apply utils in order, each republishing `IMAGE` (hires then ADetailer then upscale).

## What this does not do

- Dynamic import of `.tsx` / `.py` next to JSON
- A generic “import any workflow” uploader in the UI
- Auto chrome for every Comfy graph (input image, video, dataset folders still need a view)

Fill, compose, and extras UI stay the three seams. New graphs should reuse them rather than packing optional nodes into a main.
