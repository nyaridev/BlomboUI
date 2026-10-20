# ADR-0005: The Generate screen is a layout document

**Status:** Accepted (built in Phase 0, saved in the profile since Phase 4a)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

The user wants the Generate tab to keep its current default arrangement: loaded models on top, prompts with Generate, Interrupt and Cancel beside them, and parameter cards next to the image stage. A **Customize** button should let them move every input and control, switch each control between a few predefined styles, save the result as a preset, restore other presets or the default, and export layouts with workflows.

A Generate screen hardcoded in components can't be rearranged by users, and every new parameter means new UI code.

## Decision

Describe the screen as data (`shared/layout/schema.ts`):

```jsonc
{
  "format": "blombo.layout/1",
  "id": "default",
  "name": "Default",
  "regions": {
    "models":  [{ "type": "feature", "feature": "loaded-models" }],
    "prompt":  [{ "type": "feature", "feature": "prompts" }],
    "actions": [{ "type": "feature", "feature": "generate-actions" }],
    "params":  [
      { "type": "card", "title": "Sampling", "children": [
        { "type": "param", "bind": "role:sampler.name",  "control": "select",    "span": 6 },
        { "type": "param", "bind": "role:sampler.steps", "control": "slider",    "span": 6 },
        { "type": "param", "bind": "role:sampler.cfg",   "control": "slider",    "span": 6, "size": "sm" }
      ]},
      { "type": "feature", "feature": "resolution" },
      { "type": "feature", "feature": "seed" },
      { "type": "stage", "stage": "hires" },
      { "type": "stage", "stage": "adetailer" },
      { "type": "stage", "stage": "controlnet" },
      { "type": "params-rest", "title": "More" }
    ],
    "stage":   [{ "type": "feature", "feature": "image-stage" }, { "type": "feature", "feature": "thumb-strip" }]
  },
  "sizes": { "params": 420 }
}
```

- **Bind targets**: `role:<role>` (portable across workflows) or `id:<bindingId>` (one workflow). A block whose target is missing doesn't render, and in Customize mode it shows as a ghost.
- **`params-rest`** shows every binding not placed elsewhere. Imported workflows therefore work with no layout edits.
- **Control variants** per parameter type, from a registry in `client/features/generate/blocks/controls.ts`:
  - number: `slider`, `number` (stepper with drag-scrub), `chips` (preset values), `inline` (label + scrub value)
  - enum: `select`, `segmented`, `chips`, `list`
  - bool: `switch`, `checkbox`, `button`
  - string: `text`, `textarea`
  - model: `tile`, `select`
- **Block style props**: `span` (1–12 grid columns), `size` (`sm`/`md`/`lg`), `label` (`top`/`left`/`inside`/`hidden`), `hidden`.
- **Customize mode**: dnd-kit sortable regions, an inspector sheet for the selected block, undo and redo, **Save as preset**, **Reset to default**. Layout presets are files in `layouts/`. A workflow links one with `manifest.layout`, or falls back to the profile's default.

## Consequences

- Built-in feature blocks still exist as components (prompts, LoRA strip, image stage), but placing them is data.
- Each block renders on its own and subscribes only to its binding's value, so changing one value never re-renders the whole view.
- Export bundles carry the linked layout. Importing a layout with unknown bindings shows ghosts instead of failing.

## Implementation notes (Phase 4a)

- Layout presets moved from the browser's storage to the profile: built-ins in `presets/layouts/*.json`, the profile's own in `data/profiles/<id>/layouts/<layoutId>.json` (`services/layouts.ts`). Presets left in a browser by earlier builds are moved into the profile once.
- Picking a layout links it to the workflow (`manifest.layout`). Unlinked workflows show the profile's default (`settings.generate.layout`, "default" when unset); **Reset to default** unlinks. A linked layout that was deleted falls back to the default quietly.
- `GET /api/workflows/:id` returns the manifest plus `layoutDoc` and `layoutSource`, so the Generate screen gets the right layout with the workflow.
- Customize edits stay local until **Save** (profile layouts only; built-ins can't be overwritten), **Save as…** (creates and links) or **Discard**.

## Action items

1. [x] Layout schema, the default layout (models on top, prompts + actions, params + stage), and a layout renderer.
2. [x] Control registry plus per-type variants in `ui/`.
3. [x] Customize mode: DnD, inspector, undo, presets (saved in the profile, linked per workflow).
4. [ ] Export layouts with workflows (`.blombo`, Phase 4b).
