# ADR-0021: Long video as chained extend parts, smooth motion, character swaps, attention

**Status:** Accepted (built)
**Date:** 2026-11-06
**Deciders:** nyaridev

## Context

Every video workflow (Wan 2.2 5B and 14B, LTX-2.3, MiniMax H3) makes one clip of 2–5 s. The owner
asked for:

- longer videos on every video model;
- swapping a character into a video (SCAIL 2 with its relight LoRA, MiniMax H3's swap LoRA);
- smoother video (frame interpolation);
- faster generation (Comfy Kitchen and other attention backends).

ComfyUI 0.44 has the core nodes for all of it: `LoadVideo`, `GetVideoComponents`,
`ImageFromBatch`, `BatchImagesNode`, `AudioConcat`, `TrimAudioDuration`, `ColorTransfer`,
`FrameInterpolate`, `WanSCAILToVideo`, `SAM3_VideoTrack`, `MiniMaxH3AddGuide`,
`MiniMaxH3ReferenceToVideo`. It also has `--use-ck-attention`, `--use-sage-attention` and
`--use-flash-attention`. No custom node pack is needed.

## Decision

- **Continue a video is a source mode** (`extend`). There is one package per model
  (`source-*-extend`), each with the same shape:
  - the old video's last K frames start the new part: Wan's start images, LTX's in-place latent,
    H3's guide clip with its sound;
  - after decoding, the new frames' colors are matched to the old last frame (`ColorTransfer`,
    `uniform`: one transform from all the new frames, so changes within the part stay), since a
    new part drifts in color and the join shows it; SCAIL uses `per_frame`, as ComfyUI's template
    does;
  - the first K new frames are dropped and the old frames go in front;
  - the old sound goes in front of the new sound (trimmed by K / fps).

  So **each part's file is the whole video so far**. New ports make this generic: `SOUND` (the
  audio into the video maker) and `AUDIO_VAE`.
- **Long video is a script** (Scripts → Long video: 2–8 parts, a prompt per part).
  `services/longvideo.ts` queues one part at a time in the normal queue, as one group. Each next
  part is queued as `extend` from the last part's video, copied into the profile as a stage
  video.
  - The parts before the last are saved in the workflow's `segments/` folder, which the gallery
    hides (`gallery.excludeSegments`).
  - Smooth motion runs on the last part only.
  - Cancelling the group, a failed part, or a profile switch ends the chain.

  Chosen over one big graph per length (it can't grow past VRAM and needs a graph per count) and
  over sliding-window custom nodes (a pack per model).
- **Smooth motion is a stage** (`smooth`, after decoding): `FrameInterpolate` with RIFE or FILM at
  2–4×. The package's new `roles` field sets the workflow's `video.fps` binding to fps ×
  multiplier, so the length and the sound stay the same. Where the frame rate comes in linked
  instead (the SCAIL swap takes its input video's), the package multiplies it in the graph (port
  `FPS`). It's a pass tab on video workflows.
- **Character swaps are presets**:
  - `scail2-replace`: SCAIL 2 with its DPO and relight LoRAs, a 6-step distill LoRA, and SAM 3.1
    to find who to replace.
  - `minimax-h3-swap`: H3's reference to video with the Character Swap LoRA and the reference
    turbo LoRA.

  Both make the input video's shape at a megapixel count (`video.megapixels`, scaled with
  `ImageScaleToTotalPixels` to 32 px steps), never a fixed size: a fixed landscape size cropped a
  portrait video to its middle and lost the person. SCAIL pads the character picture to that
  shape (`ResizeAndPadImage`) instead of letting `WanSCAILToVideo` crop it. Relight is a switch
  times a strength, so off is strength 0, which ComfyUI's LoRA loader skips.

  Both read only a window of the input video (Start at, Length in seconds): a `Video Slice`
  right after the `LoadVideo` cuts it before `GetVideoComponents` decodes it, since decoding a
  whole long file (a 10-minute 540p video is about 100 GB of frames) filled the memory. SCAIL
  makes at most 81 frames per run; a longer window runs in parts on a plain click, as a Long
  video chain, each part reading only its own window (from 5 frames before the end of the video
  so far, by its frame count and rate, which the MP4's header gives). SCAIL makes the video at
  its input's frame rate. H3 reads its reference as 24 fps whatever the file's rate is, so a
  60 fps video came out slowed down. The H3 swap resamples the window to 24 fps first:
  `VideoFrameSample` (uniform) picks `round(frames × 24 / fps)` evenly spaced frames. It needs a
  video, so the window's frames go through `CreateVideo` first. Core ComfyUI has no node that
  resamples frames, and `VideoFrameSample` on the cut file would read from the file's start. A
  video under 24 fps keeps its frames, since uniform sampling can't add frames. They share the
  built-in **Character swap** layout (`presets/layouts/swap.json`), which puts these settings on
  the First pass card.

  Their picture and video inputs are bindings (`image.input`, the new `video.input`, binding type
  `video`) that Generate shows as file wells. A value that is a stage file name is uploaded to
  ComfyUI before the run.
- **Long SCAIL** uses `source-scail2-extend`: it links the video so far `into`
  `WanSCAILToVideo.previous_frames`. A package's `roles` can now also link a binding to one of
  its own nodes: the driving video's slice (`video.offset`) starts at the video so far's frame
  count minus 5.
- **Attention is a launch option of the profile** (`profile.launch`: default, Comfy Kitchen,
  SageAttention, FlashAttention, plus Comfy Kitchen's Triton kernels), passed to managed slots
  only. Settings → ComfyUI offers only the backends the slot can import, and installs
  SageAttention (Windows wheels pinned by SHA-256) as a pip-only pack through the stage
  installer.

## Consequences

- Any video model with a first-frame path can get a `source-<model>-extend` package; the chain
  needs nothing else.
- A part with Smooth motion on can't be continued at the same frame rate: continue the unsmoothed
  parts, and smooth the last.
- H3's swap continues only as separate clips for now: its extend package fits H3's image to video
  node, not the reference one.
- SCAIL keeps the driving video's whole sound track, as ComfyUI's template does.
