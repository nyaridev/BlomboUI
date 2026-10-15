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

Built-in presets ship in `presets/workflows/<id>/` with the same files and are copied into a profile when installed.

## The manifest

```jsonc
{
  "format": "blombo.workflow/1",
  "id": "illustrious-portrait",
  "name": "Illustrious · Portrait",
  "kind": "generate",                 // or "batch" (runs over files / folders)
  "family": "Illustrious",
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
  "stages": { "hires": { "enabled": true, "scale": 1.5 } },
  "layout": null,                     // or a layout id
  "createdAt": "…", "updatedAt": "…"
}
```

- **Bindings** connect a UI parameter to `(node, input)` in `prompt.json`. Types: `prompt`, `int`, `float`, `enum`, `bool`, `string`, `seed`, `model`, `image`.
- **Roles** (`src/shared/workflow/roles.ts`) mark what a binding *means*, so smart features attach to any graph: the prompt editor, LoRA tags, wildcards, resolution picker, seed modes, model galleries and stages.
- **Values** hold the current settings. Every change saves into the workflow (debounced). There are no templates: to keep a variant, **Duplicate** the workflow.

## Importing

Drop a file on the workflow picker, the Generate screen or File Info:

| You drop | What Blombo reads |
|---|---|
| ComfyUI PNG / WebP | the embedded `prompt` (API) and `workflow` (UI) chunks |
| API JSON | the graph as is; a UI graph is laid out automatically |
| UI JSON | the canvas as is; it's converted to API with `/object_info` (anything that can't be converted is finalized on the first Edit in ComfyUI) |
| `.blombo` | a full package: manifest, graphs, linked layout, thumbnail |

The **analyzer** then:

1. reads node definitions from ComfyUI's `/object_info` (types, ranges, choices)
2. finds roles: text encoders traced to the sampler's positive/negative inputs, loaders, samplers, latent size, LoRA loaders (including rgthree Power Lora Loader), image inputs, outputs
3. exposes extra inputs on nodes titled with a `$` prefix, for example `$Detail strength`
4. reports missing custom nodes and models

A **setup screen** shows the result. You confirm roles, rename or hide parameters, then save.

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

## Running (compile)

```text
prompt.json
  → apply values to bindings
  → expand __wildcards__ (seeded per image)
  → move <lora:name:strength> tags into the LoRA stack
  → splice enabled stages at role ports
  → seeds, filename prefixes, output nodes
  → POST /prompt (client_id = this server) → progress and previews on the live bus
```

## Batch workflows

`kind: "batch"` workflows (background removal, upscale, captioning, dataset prep) have an `image.input` binding. The runner feeds it from a file list or a folder, one job per file, and output handlers save images or write sidecar `.txt` files.

## Export

**Export** writes `<name>.blombo` (a zip): `workflow.json`, `graph.json`, `prompt.json`, the linked layout, and the thumbnail. Import it on any machine or profile.
