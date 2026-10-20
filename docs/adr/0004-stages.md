# ADR-0004: Stages — Hires fix, ADetailer, ControlNet as graph patches on role ports

**Status:** Accepted (built in Phase 4a; Hires fix, ADetailer and ControlNet checked on a real ComfyUI 0.42.1 with real models on 2026-10-21; diffusion-model stages only in fixture tests)
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

## Implementation notes (Phase 4a)

- **Ports are found, not bound.** `findPorts()` in the analyzer walks from the main sampler at compile time (after LoRAs are chained), so the manifest needs no `port.*` bindings and every graph the analyzer understands gets stages.
- **Stub syntax.** `PORT:<PORT>` nodes (with `from: "base"` for the pre-stage value, `optional: true` for inputs that can go), `OUT:<PORT>` nodes to republish, and `_meta.blombo` `when` / `else` / `inputsWhen` for parts that depend on a setting (an upscale model, SAM, a custom prompt, a preprocessor). Everything is data in `presets/stages/`; the splicer has no per-stage graph code.
- **Families instead of one package per stage.** `checkpoint` and `diffusion` packages; the workflow's family picks first, any package whose required ports exist is the fallback. Diffusion packages sample with `SamplerCustomAdvanced` + `BasicGuider`, give the detailer an empty negative, and apply ControlNet to the prompt only.
- **ADetailer reads the base prompt**, not the ControlNet conditioning; Hires fix reads the ControlNet one, as the base sampler does.
- **Checks are a dry run.** The same splice runs on a copy of the workflow per stage and reports missing ports, custom nodes (by pack), models (not picked, not in the folder) and ComfyUI's choices for each field. The UI shows them before a run and offers Models → Manager or ComfyUI; the compiler refuses with the same messages.
- **Control images live in the profile** (`inputs/`, content-named) and are uploaded to ComfyUI per run, so a ComfyUI restart or another slot never loses them.
- **Progress segments** come from the compiled graph: each sampling node belongs to a segment (base passes, Hires fix, each ADetailer unit).
- **Custom nodes install from the notice** on a managed slot (ADR-0013): packs carry a pinned `ref` and Blombo downloads them, installs their requirements and restarts ComfyUI. An external ComfyUI gets the repository and ComfyUI-Manager instructions. The ADetailer and ControlNet node specs were written from the Impact Pack / Impact Subpack / controlnet_aux sources and tested against the fake ComfyUI; a run on real models is still to be checked.

## Action items

1. [x] Author `hiresfix` and `adetailer` stage packages for both checkpoint and diffusion families.
2. [x] Write the ControlNet stage (Apply ControlNet Advanced + common preprocessors via comfyui_controlnet_aux).
3. [x] Stage UI blocks: compact header with an enable switch, an inherited-value pattern and units tabs.
4. [ ] Upscale stage (after ADetailer), and user stage packages dropped into the profile.
5. [ ] Check a real run of each stage on real models (needs detector, SAM and ControlNet downloads, and the real packs installed through ADR-0013).
6. [x] Install the custom node packs a stage needs from its notice (ADR-0013).
