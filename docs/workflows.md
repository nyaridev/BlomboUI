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
  "stages": { "hires": { "enabled": true, "scale": 1.5 } },
  "layout": null,                     // or a layout id
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

Hires fix, ADetailer, ControlNet and upscale are **stages**: graph patches in `presets/stages/<id>/` that splice into any workflow at role ports (`port.MODEL`, `port.CLIP`, `port.VAE`, `port.POSITIVE`, `port.NEGATIVE`, `port.LATENT`, `port.IMAGE`). They run in a fixed order:

```text
controlnet → base → hires → adetailer (units) → upscale
```

Stage parameters inherit the base values (steps, CFG, sampler, prompt, model, LoRAs) until you unlink them.

Stages aren't wired yet: the Generate layout shows them as placeholders until their phase.

## Running (compile)

```text
prompt.json
  → apply values to bindings
  → expand __wildcards__ and {a|b|c} choices (seeded per image)
  → move <lora:name:strength> tags into the LoRA stack
  → (later) splice enabled stages at role ports
  → seed, filename prefix
  → POST /prompt (client_id = this server) → progress and previews on the live bus
```

The compiler (`services/workflows/compile.ts`) is pure and tested; the job queue feeds it the wildcard files and ComfyUI's LoRA list.

- **Seeds.** Each run is its own ComfyUI prompt. The seed mode decides each run's seed: `random` (new every run), `fixed`, `increment` or `decrement` (from the workflow's seed; the next click continues where this one stopped). The same seed always gives the same wildcard picks.
- **Wildcards.** `__outfits/fantasy__` picks a random line from `<wildcards>/outfits/fantasy.txt` (blank lines and `#` comments skipped); lines may use more wildcards. `{red|blue}` picks one option. An unknown wildcard stops the run with the file name it looked for.
- **LoRAs.** `<lora:name>`, `<lora:name:0.8>` or `<lora:name:0.8:0.5>` (model, CLIP strength) are removed from the text. The name matches a file in the loras folder by path, name or file name, ignoring case and extension. With a LoRA stack node they become its `lora_<n>` entries; otherwise `LoraLoader` nodes are chained right after the model and CLIP loaders (model-only when there's no CLIP). An unknown LoRA stops the run and says which tag.
- **Filenames.** When the graph's save node still has ComfyUI's default prefix, Blombo sets `%year%-%month%-%day%/<workflow id>`, so outputs are filed by day and workflow. A managed ComfyUI writes into the profile's outputs folder.
- **Metadata.** Saved images carry ComfyUI's `prompt` chunk plus a `blombo` chunk: workflow id and name, seed, values and the final prompt texts.

## Batch workflows

`kind: "batch"` workflows (background removal, upscale, captioning, dataset prep) have an `image.input` binding. The runner feeds it from a file list or a folder, one job per file, and output handlers save images or write sidecar `.txt` files.

## Export

**Export** writes `<name>.blombo` (a zip): `workflow.json`, `graph.json`, `prompt.json`, the linked layout, and the thumbnail. Import it on any machine or profile.
