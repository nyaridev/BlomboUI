# ADR-0004: Stages — Hires fix, ADetailer, ControlNet as graph patches on role ports

**Status:** Proposed
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

Optional stages like Hires fix and ADetailer can live as separate graphs with `PORT:*` stub nodes that are spliced onto a main graph. That pattern only scales if the splice points are found automatically, not hardcoded per model family. ControlNet needs a different splice point (before the sampler, on conditioning) than Hires fix or ADetailer (after decode). The user wants Hires, ADetailer and ControlNet to be easy to use and smooth.

## Decision

A **stage** is a package in `presets/stages/<id>/`:

```text
stage.json     { id, name, attach, requires[], provides[], bindings[], defaults, ui }
prompt.json    ComfyUI API graph with PORT:<ROLE> stub nodes
```

- `attach`: one of `before_sampler` (conditioning: ControlNet, IP-Adapter), `after_sampler` (latent: latent upscale), `after_decode` (image: Hires model upscale, ADetailer, upscalers) or `before_save`.
- `requires` lists role ports (`port.MODEL`, `port.CLIP`, `port.VAE`, `port.POSITIVE`, `port.NEGATIVE`, `port.IMAGE`, `port.LATENT`). The analyzer finds these in *any* workflow (ADR-0003), so stages work on imported graphs too.
- Stages chain in a fixed order (`controlnet → base → hires → adetailer[1..n] → upscale`). Each one republishes the ports it changes.
- Stage parameters are bindings like any other. They inherit base values (steps, cfg, sampler, prompt, model, LoRAs) unless an **override** is on. Overrides stay quiet: an inherited field shows the base value, dimmed, with a small link icon. Clicking it unlinks the field.
- ADetailer keeps **units** (an array of stage instances), each with a detector, optional SAM, and its own overrides.
- ControlNet has **units** too: image (upload, from gallery, or from the last output), preprocessor, model, strength, start and end. The preview shows the preprocessed map.

## Consequences

- One compiler path for all stages, and the stage order is shown in the progress bar segments.
- Stages are listed per workflow as **available** or **missing requirements** (for example, "needs port.VAE").
- Users can add their own stages later by dropping a stage package. That isn't exposed in the UI yet.

## Action items

1. [ ] Author `hiresfix` and `adetailer` stage packages for both checkpoint and diffusion families.
2. [ ] Write the ControlNet stage (Apply ControlNet Advanced + common preprocessors via comfyui_controlnet_aux).
3. [ ] Stage UI blocks: compact header with an enable switch, an inherited-value pattern and units tabs.
