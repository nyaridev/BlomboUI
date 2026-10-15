# ADR-0003: Workflow packages with an analyzed binding manifest

**Status:** Proposed
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

A wrapper that hardcodes how to fill each ComfyUI node type (one code path per `class_type`, one hand-written editor per parameter) can't take arbitrary graphs: every new workflow means new code. Templates that snapshot parameters per workflow add a second source of truth, with rules about which fields they override.

The user wants:
- to drag and drop (or pick) any ComfyUI workflow and have it set up automatically
- presets for generation, captioning, background removal and more
- no templates: changes save into the workflow, and **duplicate** makes an independent copy
- **Edit in ComfyUI**, with a bundled extension that saves back to Blombo
- export and import of workflows together with their layouts

## Decision

A workflow is a **package folder** in the profile:

```text
workflows/<id>/
  workflow.json   manifest (Zod: WorkflowManifest)
  graph.json      ComfyUI UI graph, used for editing
  prompt.json     ComfyUI API graph, used for running
  thumb.webp      last or chosen preview
```

The manifest holds **bindings**. A binding maps a UI parameter to a `(node id, input name)` in `prompt.json`, with a type (`prompt`, `int`, `float`, `enum`, `bool`, `string`, `model:<kind>`, `image`, `seed`) and constraints from `/object_info`. A binding may carry a semantic **role** from a fixed vocabulary in `shared/workflow/roles.ts`:

```text
prompt.positive  prompt.negative
model.checkpoint model.unet  model.vae  model.clip  model.clip2  lora.stack
sampler.seed  sampler.steps  sampler.cfg  sampler.name  sampler.scheduler  sampler.denoise
latent.width  latent.height  latent.batch  clip.skip
image.input  mask.input  output.image  output.text
port.MODEL  port.CLIP  port.VAE  port.POSITIVE  port.NEGATIVE  port.LATENT  port.IMAGE
```

Roles let generic features (prompt editor, LoRA tags, wildcards, resolution picker, seed modes, model galleries, stages) attach to *any* workflow. Bindings without a role render as generic controls.

**The analyzer** (`server/services/workflows/analyze.ts`):
1. normalizes input to API and UI graphs (see *Import* below)
2. loads `/object_info`, cached per ComfyUI slot and refreshed when custom nodes change
3. runs a rule table over node classes (KSampler family, loaders, LoRA loaders including rgthree Power Lora Loader, latent nodes, CLIPTextEncode traced through links to sampler `positive` and `negative`, CLIPSetLastLayer, LoadImage, SaveImage and PreviewImage)
4. exposes extra widget inputs as parameters when the node title starts with `$` (for example `$Detail strength`), or when the user ticks them on the setup screen
5. returns a manifest draft plus findings: missing custom nodes, missing models, unrecognized outputs

**Import sources:**

| Source | API graph | UI graph |
|---|---|---|
| Save to Blombo (bridge) | from `graphToPrompt()` | from the canvas |
| ComfyUI PNG or WebP | `prompt` chunk | `workflow` chunk |
| API JSON | as is | generated grid layout |
| UI JSON | converted with `/object_info` (best effort), finalized on the first "Edit in ComfyUI" | as is |
| `.blombo` bundle | included | included |

**Values replace templates.** `workflow.json.values` holds the current value of every binding. Edits save automatically (debounced). **Duplicate** copies the folder under a new id and name and records `parentId`. **Reset to preset** reloads values from the shipped preset version.

**Re-sync after an edit in ComfyUI** matches old bindings by `(node id, input)`, then by `(class_type, title, input)`. Values carry over, and removed bindings are reported on the setup screen.

**Presets** live in `presets/workflows/`. They are copied into a profile when the user installs them, during profile creation or from the workflow picker. Each preset has a `presetVersion`, so updates can be offered.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Hardcoded fill per class type + per-workflow UI | Simple for a few graphs | Every new graph is code; no import |
| **Analyzed manifest + roles (chosen)** | Any graph works; presets and imports share one format; the UI is generic | Analyzer heuristics need good tests; odd graphs need manual binding |
| Expose every widget input automatically | Zero heuristics | Unusable wall of controls; loses smart features |

## Consequences

- The workflow picker can show any number of workflows. Categories come from `kind` (`generate`, `batch`) and user tags.
- `batch` workflows (background removal, upscale, caption, dataset prep) share one runner: an `image.input` binding fed from a file list or folder, plus output handlers (`image` → save, `text` → sidecar `.txt`).
- Harder: UI-JSON-only imports with subgraphs may need a pass through ComfyUI to finalize. The setup screen says so plainly.

## Action items

1. [ ] `shared/workflow/{roles,manifest,bindings}.ts` schemas.
2. [ ] Analyzer with a fixture suite: every built-in preset plus 10 community workflows (SD1.5, SDXL, Flux, Wan image, Krea, rgthree LoRA stacks, subgraphs).
3. [ ] Compiler: values → prompt, wildcards, LoRA tags → stack, seeds, filename prefixes.
4. [ ] Import endpoints, the setup screen, duplicate, reset, export and import of `.blombo`.
