# ADR-0020: Video first pass: modes as source packages

**Status:** Accepted (built)
**Date:** 2026-11-06
**Deciders:** nyaridev

## Context

Generate's First pass tab had one menu for every workflow: Text to image, Image to image,
Inpaint. For a video workflow (Wan 2.2, LTX-2) those are the wrong choices: a video starts from
text, from a **first frame**, or from a **first and a last frame**. Blombo didn't know a workflow
made video at all, showed Hires fix, ADetailer and ControlNet for it, and drew the result as a
broken `<img>`.

Each model takes frames its own way (ComfyUI 0.44):

| Workflow | First frame | First and last frame |
|---|---|---|
| Wan 2.2 TI2V 5B | `Wan22ImageToVideoLatent.start_image` | can't: needs Wan 2.2 Fun Inpaint 5B and `WanFunInpaintToVideo` |
| LTX-2.3 | `LTXVImgToVideoInplace` | `LTXVAddGuide` at 0 and -1, `LTXVCropGuides` after sampling |

## Decision

- **The analyzer knows video.** An output node that saves a video is the `output.video` role, so
  the workflow detail says `media: "video"`. New roles `latent.length` and `video.fps`, and a
  `VIDEO` port: the empty video latent (`START` for Wan, the `video_latent` of LTX's audio + video
  concat). The decoder search follows LTX's AV split.
- **Video modes are more packages of the `source` stage**, not a new stage. `SOURCE_MODES` gains
  `first` and `firstLast`; `SourceSettings` gains `last`. `stage.json` gains `modes` (what a
  package serves) and `fits` (classes the node at its first required port must be). `pickPackage`
  filters by both. Packages: `source-wan22`, `source-wan22-fun`, `source-ltx2`, `source-ltx2-flf`.
- **Wan's first and last frame swaps the model** to Wan 2.2 Fun Inpaint 5B (chosen by the owner),
  inside the package. The base model's LoRAs don't apply to it.
- **Modes a workflow can't do are hidden** (chosen by the owner). `GET /api/workflows/:id` lists
  `sourceModes`: Text to image (or video) plus the modes whose package fits.
- Video workflows hide the Hires fix, ADetailer and ControlNet tabs; Generate's box plays the video.
- Built-in presets `wan22-5b` and `ltx23`.

## Consequences

- A new video model is one or two packages in `presets/stages/` plus its classes in the fake
  ComfyUI; a model no package fits gets Text to video only.
- Old saved settings read as before (`last` defaults to null; `readStages` salvages it).
- Video results open in the browser's own player (its full-screen button), not the image viewer.
