# Workflows

A **workflow** in BlomboUI is a real ComfyUI graph plus a manifest that tells the UI which inputs to show and how. Built-in presets and anything you import use the same format. Decisions: [ADR-0003](adr/0003-workflow-packages.md) (packages), [ADR-0004](adr/0004-stages.md) (stages), [ADR-0009](adr/0009-comfy-bridge.md) (editing in ComfyUI).

## Package layout

```text
data/profiles/<profile>/workflows/<id>/
├── workflow.json   manifest (schema: src/shared/workflow/manifest.ts)
├── graph.json      ComfyUI UI format (nodes + links), opened by "Edit in ComfyUI"
├── prompt.json     ComfyUI API format (class_type + inputs), compiled and sent to /prompt
└── thumb.webp      picker thumbnail
```

Built-in presets ship in `presets/workflows/<id>/` with the same files and are copied into a profile when installed (during profile creation, from the workflow picker, or from the empty Generate screen). Today: **SD 1.5**, **SDXL** and **Illustrious** text-to-image. Deleting a workflow moves its folder to `data/profiles/<profile>/trash/workflows/`.

## The manifest

```jsonc
{
  "format": "blombo.workflow/1",
  "id": "illustrious-portrait",
  "name": "Illustrious · Portrait",
  "kind": "generate",                 // or "batch" (runs over files / folders)
  "family": "Illustrious",
  "description": "…",                 // shown in pickers (presets)
  "parentId": "illustrious",          // set by Duplicate
  "preset": { "id": "illustrious", "version": 3 },
  "bindings": [
    { "id": "prompt.positive", "role": "prompt.positive", "node": "2", "input": "text", "type": "prompt", "label": "Prompt" },
    { "id": "sampler.steps", "role": "sampler.steps", "node": "5", "input": "steps", "type": "int",
      "label": "Steps", "min": 1, "max": 100, "step": 1, "presets": [20, 25, 28, 30, 40] },
    { "id": "n14.sharpness", "node": "14", "input": "sharpness", "type": "float",
      "label": "Detail sharpness", "group": "More from this workflow", "min": 0, "max": 2, "step": 0.05 }
  ],
  "values": { "sampler.steps": 28, "n14.sharpness": 0.35 },
  "run": { "seedMode": "random", "count": 1 },  // random | fixed | increment | decrement; runs per click
  "stages": { "hires": { "enabled": true, "scale": 1.5 } },  // see Stages
  "layout": null,                     // a linked layout id (Layouts); null: the profile's default
  "createdAt": "…", "updatedAt": "…"
}
```

- **Bindings** connect a UI parameter to `(node, input)` in `prompt.json`. Types: `prompt`, `int`, `float`, `enum`, `bool`, `string` (with `multiline` for text boxes), `seed`, `model` (with `modelKind`), `image`, and `loras` (a LoRA stack node, filled from prompt tags). Ranges for roles are comfortable UI ranges (steps 1–150, CFG 1–20); ComfyUI's own limits still apply when it runs.
- **Choices** (`options`) are saved at import time and refreshed from ComfyUI's `/object_info` whenever the workflow is opened, so new models and samplers appear without re-importing.
- **Roles** (`src/shared/workflow/roles.ts`) mark what a binding *means*, so smart features attach to any graph: the prompt editor, LoRA tags, wildcards, resolution picker, seed modes, model galleries and stages.
- **Values** hold the current settings. Every change saves into the workflow (debounced). There are no templates: to keep a variant, **Duplicate** the workflow.

## Importing

Drop a file on the workflow picker, the Generate screen or File Info:

| You drop | What Blombo reads |
|---|---|
| ComfyUI PNG / WebP | the embedded `prompt` (API) and `workflow` (UI) chunks |
| API JSON | the graph as is; a UI graph is laid out automatically |
| UI JSON | the canvas as is; it's converted to API with `/object_info` (anything that can't be converted is finalized on the first Edit in ComfyUI) |
| `.blombo` | a full package: manifest, graphs, linked layout, thumbnail (arrives with Export) |

A UI JSON can only be converted while ComfyUI runs, because the widget values are matched to inputs by `/object_info`. Reroutes, primitive nodes and bypassed nodes are resolved; subgraphs and frontend-only plugin nodes can't be converted, and the import says so (exporting with ComfyUI's **Export (API)** always works). An API JSON imported while ComfyUI runs gets a generated canvas (`graph.json`) so it can be opened in ComfyUI.

The **analyzer** then:

1. reads node definitions from ComfyUI's `/object_info` (types, ranges, choices); without it, types come from the current values
2. picks the **main sampler**: the one whose latent starts from an empty-latent (size) node. Settings split over helper nodes (`SamplerCustomAdvanced` with noise, guider, sampler and sigmas nodes) are followed too
3. finds roles by walking links from it: conditioning back to the prompt text (through ControlNet, combine and guidance nodes), the model chain back to its loader (`model.checkpoint` or `model.unet`, noting an rgthree **Power Lora Loader** on the way as `lora.stack`), the CLIP chain through clip skip to its loader (`model.clip`, `model.clip2`), the decoder's VAE loader, and the latent's width, height and batch size. A value converted to an input (a seed from a primitive or "Seed" node) is followed to where it really lives
4. exposes the widget inputs of nodes titled with a `$` prefix: a single input is labeled with the title (`$Detail strength` → "Detail strength"), several are grouped under it ("Sharpen · Sigma"). A `$` title on a node that already has a role just renames it
5. reports missing custom nodes, models that aren't in your folders, and graphs without an output

Node knowledge lives in one place, `services/workflows/nodes.ts`; detection is by input names first, so custom nodes that follow core naming work without changes. A **setup screen** (confirm roles, rename or hide parameters) comes later; today the import is saved directly and its findings are shown.

### Tip: control what gets exposed from inside ComfyUI

Title a node `$Something` and its widget inputs become Blombo parameters named after the title. Untitled nodes stay internal. This keeps big graphs tidy without touching the setup screen.

## Editing in ComfyUI

**Edit in ComfyUI** (workflow picker, or the workflow menu) opens ComfyUI in a new window with the graph loaded. The bundled **blombo-bridge** extension shows a banner:

- **Save to Blombo** sends the graph back and overwrites the workflow. Values are kept for every parameter that still exists; new and removed parameters are listed.
- **Save as copy** creates a new workflow.

Without an edit session, the extension's menu offers **Send to Blombo**, which imports the current canvas as a new workflow.

## Stages

Hires fix, ADetailer and ControlNet are **stages**: graph patches that splice into any workflow at its **ports**, the links the compiler finds from the main sampler (`services/workflows/analyze.ts` → `findPorts`):

| Port | Where |
|---|---|
| `MODEL` | the model going into the main sampler (after its LoRAs) |
| `CLIP` | the text encoder the prompt is encoded with (after CLIP skip and LoRAs) |
| `POSITIVE`, `NEGATIVE` | the conditioning going into the sampler (or its guider) |
| `LATENT`, `VAE`, `IMAGE` | the sampler's output, and the decoder that reads it (its VAE and image) |

They run in a fixed order, each reading the ports the one before left:

```text
controlnet (units) → the workflow's own sampling → hires → adetailer (units) → upscale (later)
```

ControlNet changes the conditioning, so the base sampler and Hires fix use it. ADetailer redraws with the plain prompt (`from: "base"`), since a full-image control map doesn't fit a face crop.

### Stage packages

A stage is a package in `presets/stages/<id>/` (schema: `StagePackage` in `src/shared/workflow/stages.ts`), one per stage and family:

```text
presets/stages/
├── hires-checkpoint/      stage.json + prompt.json   KSampler second pass
├── hires-diffusion/                                  SamplerCustomAdvanced + BasicGuider
├── adetailer-checkpoint/                             Impact Pack FaceDetailer, one per unit
├── adetailer-diffusion/                              …with an empty negative (ConditioningZeroOut)
├── controlnet-checkpoint/                            ControlNetApplyAdvanced on positive + negative
└── controlnet-diffusion/                             …on the prompt only
```

`stage.json` names the stage and **family** (`checkpoint`: one checkpoint file with a real negative; `diffusion`: UNET + text encoders + VAE, picked when the workflow has `model.unet` and no checkpoint), the ports it `requires` and `provides`, the custom node `packs` it may need (name, repository, classes), `fields` (a setting → `node.input` in the graph; `modelKind` marks model choices) and `defaults` used when the workflow has nothing to inherit (diffusion packages: CFG 1, `simple` scheduler).

`prompt.json` is a ComfyUI API graph with three extras:

- **`PORT:<PORT>` stub nodes** stand for the workflow's link at that port. `inputs.from: "base"` takes the port as it was before any stage changed it; `inputs.optional: true` drops links to it when the workflow has no such port (ControlNet's optional VAE).
- **`OUT:<PORT>` nodes** republish a port: whatever read the old link (the save node, the main sampler) now reads `inputs.value`.
- **`_meta.blombo`** on a node: `when: "<flag>"` keeps the node only when the flag is on, and links to a dropped node follow `else` (`"input:image"` passes that input through, `"node:p-pos"` uses another node, nothing removes the link). `inputsWhen: { "<input>": "<flag>" }` keeps one input only when its flag is on. Flags come from the settings: `upscaler` (a model is picked), `saveFirst`, `prompt` / `negative` (unlinked), `sam`, `segm` (a segmentation detector), `preprocess` (a preprocessor other than "none").

The splicer (`services/workflows/stages.ts`) copies the graph with fresh node ids, sets field values, titles nodes `"<Stage> · <title>"` (so ComfyUI errors name the stage) and strips the extras. A stage prompt's own `<lora:…>` tags become a LoRA chain for that stage only; its `__wildcards__` expand with the run's seed.

### Settings, inheritance and units

Stage settings live in the workflow under `stages` and are read with defaults by `readStages()`:

```jsonc
"stages": {
  "hires": { "enabled": true, "sizeMode": "scale", "scale": 1.5, "upscaler": "4x-UltraSharp.pth",
             "denoise": 0.35, "saveFirst": false, "steps": 15, "unlinked": ["steps"] },
  "adetailer": { "enabled": true, "units": [
    { "id": "face", "name": "Face", "enabled": true, "detector": "bbox/face_yolov8m.pt", "sam": "",
      "confidence": 0.5, "dilation": 10, "denoise": 0.4, "feather": 5, "unlinked": [] } ] },
  "controlnet": { "enabled": false, "units": [
    { "id": "unit-1", "name": "Pose", "image": { "file": "3f2a….png", "source": "gallery", … },
      "preprocessor": "DWPreprocessor", "model": "…", "strength": 0.8, "start": 0, "end": 0.8 } ] }
}
```

- **Inheritance.** Steps, CFG, sampler, scheduler, prompt and negative follow the base workflow (by role) until they're listed in `unlinked`; the UI shows them with `InheritRow` (dimmed base value, a link toggle). A linked prompt reuses the base conditioning, so it costs nothing.
- **Units.** ADetailer and ControlNet run their enabled units in order: each detailer takes the previous image, each ControlNet applies on top of the previous one.
- **Hires size.** `scale` multiplies the workflow's width and height (rounded to 8); `target` sets them. Without an upscale model the image is resized (Lanczos) before the second pass. "Also save the image before Hires fix" adds a save node on the first image (`<prefix>-first`).
- **Control images** are copied into the profile (`inputs/<sha>.<ext>`, named by content) from an upload, the gallery or the last output, and sent to ComfyUI's input folder (`blombo/…`) right before a run. **Show map** runs only the preprocessor in ComfyUI and shows the result. The gallery lightbox's **Use for ControlNet** puts an image into the first free unit.

### What's missing

`POST /api/stages/check` splices each stage into a copy of the workflow as if it were on and reports, per stage: the package that fits, the missing **ports** ("can't attach to this workflow"), missing **custom nodes** with their packs (checked against ComfyUI's `/object_info`), models that aren't **picked** or aren't **in the folder** (with the model kind), a missing size or image, plus ComfyUI's current **choices** for each field (detectors, SAM models, preprocessors, ControlNet and upscale models). The Generate screen shows these as notices in the stage block, with **Find in Manager** (Models → Manager on the right category and search) for models and **Open ComfyUI** / the pack's page for custom nodes. Generate refuses to queue an enabled stage with problems and offers to turn it off; the compiler stops with the same message if one slips through.

### Progress

Each run is split into **segments**: the workflow's own sampling passes ("Sampling", or "Pass 1", "Pass 2"…), then one per stage instance that samples ("Hires fix", "ADetailer · Face"). Segments list their sampler nodes, so ComfyUI's progress events map to the right segment; the bar never goes backwards (a detailer repeats its steps per face).

## Running (compile)

```text
prompt.json
  → apply values to bindings
  → expand __wildcards__ and {a|b|c} choices (seeded per image)
  → move <lora:name:strength> tags into the LoRA stack
  → splice enabled stages at the ports (controlnet → base → hires → adetailer units)
  → seed, filename prefix
  → POST /prompt (client_id = this server) → progress and previews on the live bus
```

The compiler (`services/workflows/compile.ts`) is pure and tested; the job queue feeds it the wildcard files, ComfyUI's LoRA list and node definitions, the stage packages and the uploaded control images.

- **Seeds.** Each run is its own ComfyUI prompt. The seed mode decides each run's seed: `random` (new every run), `fixed`, `increment` or `decrement` (from the workflow's seed; the next click continues where this one stopped). The same seed always gives the same wildcard picks.
- **Wildcards.** `__outfits/fantasy__` picks a random line from `<wildcards>/outfits/fantasy.txt` (blank lines and `#` comments skipped), or, when there's no such file, from the list at key path `outfits/fantasy` in any `.yaml` / `.yml` file in the folder (nested mappings, list leaves; a single string is one option; keys are global, so the YAML file's own name isn't part of the reference, as in Dynamic Prompts and Impact Pack). Lines may use more wildcards. `{red|blue}` picks one option. An unknown wildcard stops the run with the file name it looked for. The Wildcard Manager's roll preview uses the same expansion and seeds.
- **LoRAs.** `<lora:name>`, `<lora:name:0.8>` or `<lora:name:0.8:0.5>` (model, CLIP strength) are removed from the text. The name matches a file in the loras folder by path, name or file name, ignoring case and extension. With a LoRA stack node they become its `lora_<n>` entries; otherwise `LoraLoader` nodes are chained right after the model and CLIP loaders (model-only when there's no CLIP). An unknown LoRA stops the run and says which tag.
- **Filenames.** When the graph's save node still has ComfyUI's default prefix, Blombo sets `%year%-%month%-%day%/<workflow id>`, so outputs are filed by day and workflow. A managed ComfyUI writes into the profile's outputs folder.
- **Metadata.** Saved images carry ComfyUI's `prompt` chunk plus a `blombo` chunk: workflow id and name, seed, values and the final prompt texts. The gallery and File Info read it back: **Use these settings** reopens that workflow with its values and the image's seed fixed (falling back to what the graph ran with for anything the values don't cover). Images from ComfyUI alone or A1111 fill the active workflow by role (prompt, negative, model, sampler, scheduler, steps, CFG, seed, size, CLIP skip).

## Batch workflows

`kind: "batch"` workflows (background removal, upscale, captioning, dataset prep) have an `image.input` binding. The runner feeds it from a file list or a folder, one job per file, and output handlers save images or write sidecar `.txt` files.

## Layouts

The Generate screen is a layout document (ADR-0005, `shared/layout/schema.ts`). Built-in layouts ship in `presets/layouts/<id>.json` (**Default**, **Compact**); the profile's own are `data/profiles/<id>/layouts/<layoutId>.json`. Picking a layout in the Generate tab links it to the workflow (`manifest.layout`); **Reset to default** unlinks it, and the workflow shows the profile's default (Settings `generate.layout`, set from the layout menu; "default" when unset). `GET /api/workflows/:id` returns the manifest with the layout it shows (`layoutDoc`, `layoutSource: "linked" | "default"`), so the screen never waits for a second request. Customize edits stay on screen until **Save** (the profile's own layouts), **Save as…** (a new layout, linked to the workflow) or **Discard**; deleting moves the file to the profile's trash and workflows that used it fall back to the default. Layouts kept in the browser by older builds move into the profile once.

## Export

**Export** writes `<name>.blombo` (a zip): `workflow.json`, `graph.json`, `prompt.json`, the linked layout, and the thumbnail. Import it on any machine or profile.
