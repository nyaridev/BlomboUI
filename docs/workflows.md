# Workflows

A **workflow** in BlomboUI is a real ComfyUI graph plus a manifest that tells the UI which inputs to show and how. Built-in presets and anything you import use the same format. Decisions: [ADR-0003](adr/0003-workflow-packages.md) (packages), [ADR-0004](adr/0004-stages.md) (stages), [ADR-0009](adr/0009-comfy-bridge.md) (editing in ComfyUI), [ADR-0014](adr/0014-scripts-and-batch-runner.md) (scripts and batch).

## Package layout

```text
data/profiles/<profile>/workflows/<id>/
├── workflow.json   manifest (schema: src/shared/workflow/manifest.ts)
├── graph.json      ComfyUI UI format (nodes + links), opened by "Edit in ComfyUI"
├── prompt.json     ComfyUI API format (class_type + inputs), compiled and sent to /prompt
└── thumb.webp      preview picture (cards, the header button); set from the workflows window
```

Built-in presets ship in `presets/workflows/<id>/` with the same files and are copied into a profile when installed (during profile creation, from the workflow picker, or from the empty Generate screen). Today: **SD 1.5**, **SDXL** and **Illustrious** text-to-image; the video workflows **Wan 2.2 5B**, **Wan 2.2 14B**, **LTX-2.3** and **MiniMax H3**; the character swaps **SCAIL 2 character swap** (`scail2-replace`) and **MiniMax H3 character swap** (`minimax-h3-swap`); and the batch tools **Remove background**, **Upscale images**, **Caption images** and **Dataset prep** (Batch workflows, below). Deleting a workflow moves its folder to `data/profiles/<profile>/trash/workflows/`.

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
  "packs": [],                        // built-in presets only: pinned custom node packs (see Batch)
  "createdAt": "…", "updatedAt": "…"
}
```

- **Bindings** connect a UI parameter to `(node, input)` in `prompt.json`. Types: `prompt`, `int`, `float`, `enum`, `bool`, `string` (with `multiline` for text boxes), `seed`, `model` (with `modelKind`), `image`, and `loras` (a LoRA stack node, filled from prompt tags). Ranges for roles are comfortable UI ranges (steps 1–150, CFG 1–20); ComfyUI's own limits still apply when it runs.
- **Choices** (`options`) are saved at import time and refreshed from ComfyUI's `/object_info` whenever the workflow is opened, so new models and samplers appear without re-importing.
- **Roles** (`src/shared/workflow/roles.ts`) mark what a binding *means*, so smart features attach to any graph: the prompt editor, LoRA tags, wildcards, resolution picker, seed modes, model galleries and stages. Video workflows add `latent.length` (frames, the `length` of the video latent; a node on a coarser grid than a role's keeps its own min and step, without the role's presets: MiniMax H3's 17k + 5 frames and sizes by 32), `video.fps` (the frame rate the video is saved at) and the `output.video` output, which makes the workflow a video one. A workflow's own video input adds `video.input` (a `LoadVideo` file), `video.start` and `video.seconds` (the window of the file it reads: a `Video Slice` right after the `LoadVideo`, or a primitive that feeds its duration, cut before ComfyUI decodes it, so a long file never fills the memory), `video.offset` (the frame its slice of the video starts at; a one-frame slice is only a look at the video and isn't one; hidden when there's a window), `video.frames` (hidden: that slice's length, the most frames one run takes; a longer window runs in parts, `shared/videoparts.ts`) and `video.megapixels` (the `megapixels` of a node that scales the video's frames with their shape kept, `ImageScaleToTotalPixels`: the swap presets size their run from it, and Generate shows the size it makes from the video's).
- **Values** hold the current settings. Every change saves into the workflow (debounced). There are no templates: to keep a variant, **Duplicate** the workflow.

## Importing

Drop a file on the workflow picker, the Generate screen or File Info:

| You drop | What Blombo reads |
|---|---|
| ComfyUI PNG / WebP | the embedded `prompt` (API) and `workflow` (UI) chunks |
| API JSON | the graph as is; a UI graph is laid out automatically |
| UI JSON | the canvas as is; it's converted to API with `/object_info` (anything that can't be converted is finalized on the first Edit in ComfyUI) |
| `.blombo` | a full package: manifest (values, stages, run settings), graphs, linked layout, thumbnail (see Export) |

A UI JSON can only be converted while ComfyUI runs, because the widget values are matched to inputs by `/object_info`: in the order ComfyUI's frontend lays the widgets out, with a dynamic combo's picked choice adding its inputs right after it (`sampling_mode.temperature`…), socket-only (`forceInput`) inputs taking none, and an input the save has no value for (a node newer than the file) getting its default. Reroutes, primitive nodes and bypassed and muted nodes are resolved. **Subgraphs** are flattened the way ComfyUI runs them (`services/workflows/flatten.ts`), so every current ComfyUI template imports:

- A node inside subgraph instance 57 becomes `57:27`, inside a nested one `57:80:27`: the ids ComfyUI's own export uses, so Save to Blombo sends the same ids back and re-sync keeps every value.
- Links come in through the subgraph's inputs and go out through its outputs. An unlinked input takes the value the instance keeps for it (older saves: one per widget input), else the inner widget's own value (newer saves, with `proxyWidgets`, keep the values inside).
- A bypassed or muted instance acts like a bypassed or muted node; nothing inside it runs. Inner nodes can be bypassed or muted too.
- Instances of one subgraph share its definition, as in ComfyUI: Edit in ComfyUI writes a value where it's read from (the instance, a primitive, or the inner widget, which every instance shares).

Unknown custom nodes are reported (exporting with ComfyUI's **Export (API)** always works). An API JSON imported while ComfyUI runs gets a generated canvas (`graph.json`) so it can be opened in ComfyUI.

The **analyzer** then:

1. reads node definitions from ComfyUI's `/object_info` (types, ranges, choices); without it, types come from the current values
2. picks the **main sampler**: the one whose latent starts from an empty-latent (size) node. Settings split over helper nodes (`SamplerCustomAdvanced` with noise, guider, sampler and sigmas nodes) are followed too
3. finds roles by walking links from it: conditioning back to the prompt text (through ControlNet, combine and guidance nodes), the model chain back to its loader (`model.checkpoint` or `model.unet`, noting an rgthree **Power Lora Loader** on the way as `lora.stack`), the CLIP chain through clip skip to its loader (`model.clip`, `model.clip2`), the decoder's VAE loader, and the latent's width, height and batch size. A value converted to an input (a seed from a primitive or "Seed" node) is followed to where it really lives. Switch nodes are followed along their `on_false` branch (the plain path in ComfyUI's templates: no LoRA, no prompt rewriting), and a prompt through string switches and previews to the text node it starts at. When width and height both come from one node with settings of its own (a resolution selector's aspect ratio and megapixels), those settings show instead, grouped as "Size"
4. exposes the widget inputs of nodes titled with a `$` prefix: a single input is labeled with the title (`$Detail strength` → "Detail strength"), several are grouped under it ("Sharpen · Sigma"). A `$` title on a node that already has a role just renames it
5. reports missing custom nodes, models that aren't in your folders, and graphs without an output

Node knowledge lives in one place, `services/workflows/nodes.ts`; detection is by input names first, so custom nodes that follow core naming work without changes. A **setup screen** (confirm roles, rename or hide parameters) comes later; today the import is saved directly and its findings are shown.

### Tip: control what gets exposed from inside ComfyUI

Title a node `$Something` and its widget inputs become Blombo parameters named after the title. Untitled nodes stay internal. This keeps big graphs tidy without touching the setup screen.

## Editing in ComfyUI

**Edit in ComfyUI** (the workflow switcher's footer) opens ComfyUI in a new window with an edit session (ADR-0009). The bundled **blombo-bridge** extension loads the workflow's canvas, with the workflow's current values in its widgets, and shows a bar:

- **Save to Blombo** sends both graphs back (`app.graphToPrompt()`, so ComfyUI converts subgraphs, primitives and reroutes itself) and overwrites the workflow; the previous version is copied to the profile's trash first. **Re-sync** (`services/workflows/resync.ts`) matches every parameter to the new graph by (node, input), then (class_type, title, input), then by role, and keeps its value, unless you changed that value in ComfyUI: then ComfyUI's value is kept. New parameters (a new `$`-titled node) and removed ones are reported ("2 new parameters, 1 removed, 1 changed in ComfyUI"); removed values stay in the workflow in case the node comes back.
- **Save as copy** creates "<name> copy" next to it (`parentId` set); further saves from that window go to the copy.
- **Cancel** ends the session.

Each save uses the session's token and hands out the next one; tokens expire after two hours and only work while the same profile is open. Blombo's windows get the result over the live bus and the open workflow updates at once.

Without a session, ComfyUI's **Workflow → Send to Blombo** adds the current canvas to the open profile as a new imported workflow. Managed slots get the extension automatically; for your own ComfyUI use Settings → ComfyUI → **Install bridge** and restart ComfyUI.

## Stages

Hires fix, ADetailer and ControlNet are **stages**: graph patches that splice into any workflow at its **ports**, the links the compiler finds from the main sampler (`services/workflows/analyze.ts` → `findPorts`):

| Port | Where |
|---|---|
| `MODEL` | the model going into the main sampler (after its LoRAs) |
| `CLIP` | the text encoder the prompt is encoded with (after CLIP skip and LoRAs) |
| `POSITIVE`, `NEGATIVE` | the conditioning going into the sampler (or its guider) |
| `START` | the latent going into the main sampler (the empty one, in a text-to-image graph) |
| `VIDEO` | video workflows: the empty video latent (`START` itself for Wan and MiniMax H3; the `video_latent` input of LTX's audio + video concat) |
| `LATENT`, `VAE`, `IMAGE` | the sampler's output, and the decoder that reads it (its VAE and image) |
| `SOUND`, `AUDIO_VAE` | videos with sound: the audio going into the video maker (`CreateVideo.audio`), and the VAE that decoded it (LTX-2.3, MiniMax H3) |
| `FPS` | a frame rate that comes from another node into the video maker, not a setting (the SCAIL swap takes its input video's) |

They run in a fixed order, each reading the ports the one before left:

```text
source → controlnet (units) → the workflow's own sampling → hires → adetailer (units) → smooth → upscale (later)
```

**Source** is the first pass's mode, picked from the First pass tab's menu (its arrow; the tab names the mode when it isn't Text to image), with the image, denoise and mask at the top of that card (a layout feature, `source`, not a tab; a layout without the pass tabs shows a "Start from" dropdown there instead): Text to image leaves the graph alone; **Image to image** loads the image (a stage image, like ControlNet's), fits it to the workflow's width and height (`ImageScale`, cropped to fill), encodes it with the workflow's VAE and republishes `START`, so the main sampler starts from it; **Inpaint** also loads the painted mask (`LoadImageMask`, red channel), grows it (`GrowMask`), fits and softens it (`ImageBlur`) and puts it on the latent (`SetLatentNoiseMask`), so only the painted part is redrawn. A batch size above 1 repeats the latent (`RepeatLatentBatch`). Its denoise is set on the main sampler through the package's `base` (`"base": { "denoise": "denoise" }`: the sampler's input → the stage field; the scheduler's denoise with `SamplerCustomAdvanced`). Core nodes only, so the one package (`presets/stages/source/`) fits both families. The gallery viewer's **Start from it** puts an image in.

**Video workflows** (any whose output node saves a video: the `output.video` role) start from **Text to video**, a **First frame**, a **First and last frame**, or **Continue a video** instead, and have no Hires fix, ADetailer or ControlNet tabs (they have Smooth motion, below). The modes a workflow offers are the ones a `source` package fits (`GET /api/workflows/:id` → `media`, `sourceModes`; others are hidden): each package names its `modes` and the classes it `fits` (the node at its first required port). The frames are stage images (`image` and `last` in the source settings), fitted to the workflow's size:

| Package | Modes | How |
|---|---|---|
| `source-wan22` | First frame | a new `Wan22ImageToVideoLatent` with the start image, at the workflow's size, length and batch, replaces `VIDEO` |
| `source-wan22-fun` | First and last frame | Wan 2.2 TI2V can't take an end frame, so it swaps the model for Wan 2.2 Fun Inpaint 5B (its own `UNETLoader` + `ModelSamplingSD3` shift 8, which drops the base model's LoRAs) and `WanFunInpaintToVideo` gives `POSITIVE`, `NEGATIVE` and `VIDEO` |
| `source-ltx2` | First frame | `LTXVPreprocess` + `LTXVImgToVideoInplace` writes the frame into the empty video latent |
| `source-ltx2-flf` | First and last frame | two `LTXVAddGuide` (frame 0 and -1), and `LTXVCropGuides` on `LATENT` before decoding |
| `source-wan22-14b` | First frame | swaps Wan 2.2 14B's text to video experts and 4-step LoRAs for the image to video ones (`swap`), and `WanImageToVideo` gives `POSITIVE`, `NEGATIVE` and `VIDEO` |
| `source-wan22-14b-flf` | First and last frame | the same swap, with `WanFirstLastFrameToVideo` |
| `source-minimax-h3`, `source-minimax-h3-flf` | First frame, First and last frame | no new conditioning: the frames go `into` the workflow's own `MiniMaxH3ImageToVideo` (`first_frame`, `last_frame`), which shows them to the text encoder and anchors them at the first and last frame |
| `source-wan22-extend`, `source-wan22-14b-extend` | Continue a video | the video's last 5 frames are the start images (`Wan22ImageToVideoLatent`; the 14B swaps to its image to video experts and uses `WanImageToVideo`) |
| `source-ltx2-extend` | Continue a video | the last 9 frames (two latent frames) go into the empty video latent (`LTXVImgToVideoInplace`) |
| `source-minimax-h3-extend` | Continue a video | the last 5 frames and their sound are a guide clip at frame 0 (`MiniMaxH3AddGuide`) |
| `source-scail2-extend` | Continue a video | the whole video so far goes `into` `WanSCAILToVideo.previous_frames` (it anchors the last 5), and its `roles` cut the driving video to the next window (`video.start`, `video.seconds`: from 5 frames before the end of the video so far, by its frame count and rate, to the wanted end; `partWindow`) |

**Continue a video** (ADR-0021) takes a stage video (`video` in the source settings: an MP4 from a file, the gallery or the last output, kept with the stage images). Every extend package ends the same way: the new frames' colors are matched to the old last frame (`ColorTransfer`, one transform worked out from all the new frames; SCAIL's matches each frame, as ComfyUI's template does), the frames it started from are dropped, the old frames go in front (`BatchImagesNode`, after `IMAGE`), and the old sound goes in front of the new (`AudioConcat`, the new trimmed by the overlap's seconds; `SOUND`). The result is the whole video. The gallery viewer's **Continue it** puts a video in.

**Smooth motion** (`smooth`, a pass tab on video workflows) draws frames between the decoded frames with `FrameInterpolate` (RIFE 4.26 or FILM from the `frame_interpolation` models folder, 2–4×). Its package's `roles` sets the workflow's frame rate (`video.fps`) to the rate times the multiplier, so the length and the sound stay the same. A workflow without that setting whose frame rate comes in linked (the `FPS` port) gets a `ComfyMathExpression` that multiplies it instead (flag `linkedFps`).

**Two passes.** Wan 2.2 14B samples twice: a high noise pass (`KSamplerAdvanced`, adds the noise, stops early) and a low noise pass that samples its latent. The first sampler is the main one (the ports, seed, sampler, model), the decoder is found after the last sampler of that chain, and the second pass's own model is the `model.unet2` role ("Low noise model"; the first then reads "High noise model"). Steps and CFG come from primitives both passes read, so one control sets both. A prompt's `<lora:…>` tags go on the high noise model only.

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
├── controlnet-diffusion/                             …on the prompt only
├── source/                                           image to image and inpaint (any family)
├── source-wan22/, source-wan22-fun/                  Wan 2.2 5B's first frame, first and last frame
├── source-wan22-14b/, source-wan22-14b-flf/          Wan 2.2 14B's
├── source-minimax-h3/, source-minimax-h3-flf/        MiniMax H3's
└── source-ltx2/, source-ltx2-flf/                    LTX-2's
```

`stage.json` names the stage and **family** (`checkpoint`: one checkpoint file with a real negative; `diffusion`: UNET + text encoders + VAE, picked when the workflow has `model.unet` and no checkpoint), the ports it `requires` and `provides`, the custom node `packs` it may need (name, GitHub repository, classes, and `ref`: the commit Blombo installs; optional `folder` for its name in `custom_nodes/`, the repository name otherwise), `fields` (a setting → `node.input` in the graph; `modelKind` marks model choices) and `defaults` used when the workflow has nothing to inherit (diffusion packages: CFG 1, `simple` scheduler). Source packages also list the `modes` they serve, and `fits`: the classes the node at their first required port must be, so a Wan package never lands on an LTX graph. `swap` (file → file) switches model files in the workflow's loaders while the package runs; a package with a swap fits only a workflow that uses one of its files (Wan 2.2 14B and HunyuanVideo share their empty latent), and a target ComfyUI doesn't list is a problem that names it. `into` (port → input → the package's node and output) links package nodes into inputs of the workflow's own node at a port, for models whose one node takes the frames (MiniMax H3). `roles` (role → a field, or the package's node and output) sets the input a workflow binding points at: Smooth motion's frame rate, SCAIL's start frame.

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

`POST /api/stages/check` splices each stage into a copy of the workflow as if it were on and reports, per stage: the package that fits, the missing **ports** ("can't attach to this workflow"), missing **custom nodes** with their packs (checked against ComfyUI's `/object_info`), models that aren't **picked** or aren't **in the folder** (with the model kind), a missing size or image, plus ComfyUI's current **choices** for each field (detectors, SAM models, preprocessors, ControlNet and upscale models). The Generate screen shows these as notices in the stage block, with **Find in Manager** (Models → Manager on the right category and search) for models and, for custom nodes, **Install** on a managed slot (below) or **Open ComfyUI** and the pack's page for a ComfyUI you run yourself. Generate refuses to queue an enabled stage with problems and offers to turn it off; the compiler stops with the same message if one slips through.

### Installing custom nodes

On a managed slot, **Install** in a "needs custom nodes" notice posts the packs (by repository URL) to `POST /api/comfy/nodes/install`. The server (`services/comfy/nodepacks.ts`, ADR-0013) accepts only packs a stage package lists with a `ref`, then: downloads each pack's source zip at that commit into `ComfyUI/custom_nodes/<folder>` (a folder that's already there is kept), stops ComfyUI if it runs, installs each pack's `requirements.txt` with uv into the slot's Python (the slot's PyTorch pinned as a constraint), starts ComfyUI again and checks its node list has the pack's classes. Progress shows in the notice (`install` topic, `nodes.install`; `GET /api/comfy/nodes` after a reload), with **Stop**; a failure says what to do and offers **Install again**, which resumes. It refuses while jobs are queued or running and for an external ComfyUI, whose notice keeps the ComfyUI-Manager instructions.

### Progress

Each run is split into **segments**: the workflow's own sampling passes ("Sampling", or "Pass 1", "Pass 2"…), then one per stage instance that samples ("Hires fix", "ADetailer · Face"). Segments list their sampler nodes, so ComfyUI's progress events map to the right segment; the bar never goes backwards (a detailer repeats its steps per face).

## Running (compile)

```text
prompt.json
  → apply values to bindings
  → expand __wildcards__ and {a|b|c} choices (seeded per image)
  → move <lora:name:strength> tags into the LoRA stack
  → add instant LoRAs after them, their trigger words at the start or end of the positive prompt
  → splice enabled stages at the ports (controlnet → base → hires → adetailer units)
  → seed, filename prefix
  → POST /prompt (client_id = this server) → progress and previews on the live bus
```

The compiler (`services/workflows/compile.ts`) is pure and tested; the job queue feeds it the wildcard files, ComfyUI's LoRA list and node definitions, the stage packages and the uploaded control images.

- **Seeds.** Each run is its own ComfyUI prompt. The seed mode decides each run's seed: `random` (new every run), `fixed`, `increment` or `decrement` (from the workflow's seed; the next click continues where this one stopped). The same seed always gives the same wildcard picks.
- **Wildcards.** `__outfits/fantasy__` picks a random line from `<wildcards>/outfits/fantasy.txt` (blank lines and `#` comments skipped), or, when there's no such file, from the list at key path `outfits/fantasy` in any `.yaml` / `.yml` file in the folder (nested mappings, list leaves; a single string is one option; keys are global, so the YAML file's own name isn't part of the reference, as in Dynamic Prompts and Impact Pack). Lines may use more wildcards. `{red|blue}` picks one option. An unknown wildcard stops the run with the file name it looked for.
- **LoRAs.** `<lora:name>`, `<lora:name:0.8>` or `<lora:name:0.8:0.5>` (model, CLIP strength) are removed from the text. The name matches a file in the loras folder by path, name or file name, ignoring case and extension. With a LoRA stack node they become its `lora_<n>` entries; otherwise `LoraLoader` nodes are chained right after the model and CLIP loaders (model-only when there's no CLIP). An unknown LoRA stops the run and says which tag.
- **Instant LoRAs.** Picking a LoRA adds it to the workflow's `loras.instant` value (`[{ name, strength }]`, `shared/prompt/instant.ts`) instead of the prompt, unless its model info turns Instant off (`"instant lora": false` in its A1111 `.json`; then a tag and its trigger words go into the prompt). At run time each joins the LoRA stack after the tags' (a tag of the same file wins) and its trigger words go at the start or the end of the positive prompt (`"trigger position"`, start by default). Linked stages use that prompt; a stage prompt of its own doesn't get them. An unknown one stops the run and says to remove it from the LoRAs row.
- **Filenames.** When the graph's save node still has ComfyUI's default prefix, Blombo sets `<workflow>/images/%year%-%month%-%day%/blombo` (`outputPrefix` in `shared/gallery.ts`; the workflow's name as a slug, `workflowFolder`), so outputs land as `illustrious/images/2026-11-01/blombo_00001_.png` (ComfyUI adds the number and its trailing `_`). The other types sit beside `images/`: `grids/` (script grids) and `interrupted/` (a stopped run's images, moved there once it stops; the job and its log follow the move). Images saved before this layout stay where they are. A managed ComfyUI writes into the profile's outputs folder.
- **Metadata.** Saved images carry ComfyUI's `prompt` chunk plus a `blombo` chunk: workflow id and name, seed, values and the final prompt texts. The gallery and File Info read it back: **Use these settings** reopens that workflow with its values and the image's seed fixed (falling back to what the graph ran with for anything the values don't cover). Images from ComfyUI alone or A1111 fill the active workflow by role (prompt, negative, model, sampler, scheduler, steps, CFG, seed, size, CLIP skip).

## Scripts

The Scripts block on the Generate screen (layout feature `scripts`, `shared/scripts.ts`) makes one click queue many runs, all with the same seed (unless the seed is an axis, a matrix line repeats, or the plot asks for a random seed each):

| Script | Runs | Result |
|---|---|---|
| **Prompt matrix** | one run per line (typed or loaded from a .txt file), added at the start or end of a prompt, or replacing a text in every prompt that has it (Prompt S/R). Each line makes one image (batch size 1), or with *Use batch count and size* runs the Generate count at the workflow's batch size, the seed moving on per the seed mode | one grid: a near-square layout with each line under its image, or one row per line when lines repeat |
| **XY plot** | an X and a Y type, either may be None. Types come from the workflow: each model loader (checkpoint, diffusion model, VAE, text encoders: picked as picture tiles), **LoRA** (each joins the instant LoRAs at its saved strength or 1, trigger words with it), **Resolution** (the profile's set sizes, width and height together), any number, choice or on/off parameter (`4, 6, 8`, ranges `10-50 (+10)`, `3-9 [4]`; choices from a list), and **Prompt S/R** (the first value is the text to find, in every prompt). Only LoRA and Prompt S/R can be on both axes | one grid; options: labels (with the type or not), a random seed for each image (a seed value of -1 is random too), keep each image or only the grid (cells then run as previews), margins between cells |
| **Long video** (video workflows that can continue a video) | 2–8 parts, one at a time (`services/longvideo.ts`): the first with the workflow's own first pass, each next one as Continue a video from the last part's file, with its own prompt (a line each; empty keeps the prompt). Smooth motion runs on the last part only | one video: each part's file is the whole video so far; the parts before the last go to `<workflow>/segments/<date>/`, which the gallery hides (Settings → Gallery) |
| **Compare** (its own view) | any number of rows, each an XY-plot type with its values; a comparison is saved with the settings it starts from (Generate's values and stages when it was made, or taken again) | every combination (first row fastest, at most 500), one seed unless "a new random seed for each image" (a seed row's own value wins, -1 random); images go to the outputs folder and the gallery like any run, and the comparison keeps which one is which combination, so a new value runs only the new combinations |

A script queues at most 100 runs; the block shows the count and what's wrong before you click. Grids are put together by the server (`lib/grid.ts`, sharp) into `<outputs>/<workflow>/grids/<date>/`, appear on the image stage and in the gallery. The planner still has **Thumbnails** (one run per model, each image saved as that model's picture in `<model>_data/`, ADR-0016), but the block doesn't offer it for now.

## Batch workflows

`kind: "batch"` workflows have an `image.input` binding and no sampler (the analyzer marks such imports as batch too). The Generate screen shows the batch runner for them (ADR-0014): pick **a folder** (subfolders optional) or **files** (Choose files…, or drop them), an output folder (by default a subfolder named after the workflow, or the image folder itself for workflows that only write text), and run. Each file is one job in the queue: it's uploaded to ComfyUI's `input/blombo/batch/` right before its run, and as it finishes Blombo writes

- the images it made as `<name>.png` (`<name>_2.png`… for more than one), copied from ComfyUI (built-in batch presets end in Preview Image, so ComfyUI's outputs folder stays clean)
- the text it showed (a tagger's tags, a caption) as `<name>.txt`, with an optional prefix such as a trigger word

**Skip existing** leaves out files whose result is already there, so a stopped batch resumes. A result never replaces the image you picked (it gets `-out`), and a file it would replace moves to the profile's trash first. Progress per file, outputs and errors are on the live bus (`batch` topic); a failing file doesn't stop the others.

The built-in batch presets (`presets/workflows/`):

| Preset | Nodes | Custom nodes |
|---|---|---|
| Remove background | Inspyrenet Rembg Advanced (threshold) → Preview Image (transparent PNG) | [ComfyUI-Inspyrenet-Rembg](https://github.com/john-mnz/ComfyUI-Inspyrenet-Rembg); its model downloads on first use |
| Upscale images | Upscale model loader → upscale with model → Upscale Image By (final scale) | none (needs a model in `upscale_models/`) |
| Caption images | WD14 Tagger → `<name>.txt` | [ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger); its model downloads on first use |
| Dataset prep | Image Scale (center crop to a training size) → Preview Image, and WD14 Tagger | WD14 Tagger |

Their packs are pinned in the manifest's `packs` (like stage packages, ADR-0013), so the batch view's notice offers **Install** on a managed slot (`GET /api/batch/check/:id` says what's missing).

## Layouts

The Generate screen is a layout document (ADR-0005, `shared/layout/schema.ts`). Built-in layouts ship in `presets/layouts/<id>.json` (**Default**; a built-in that is removed later, like Compact, falls back to the default wherever it was linked or set); the profile's own are `data/profiles/<id>/layouts/<layoutId>.json`. Picking a layout in the Generate tab links it to the workflow (`manifest.layout`); **Reset to default** unlinks it, and the workflow shows the profile's default (Settings `generate.layout`, set from the layout menu; "default" when unset). `GET /api/workflows/:id` returns the manifest with the layout it shows (`layoutDoc`, `layoutSource: "linked" | "default"`), so the screen never waits for a second request. Customize edits stay on screen until **Save** (the profile's own layouts), **Save as…** (a new layout, linked to the workflow) or **Discard**; deleting moves the file to the profile's trash and workflows that used it fall back to the default. Layouts kept in the browser by older builds move into the profile once.

Params blocks: `param` (one binding in a control style), `feature` (Size, Seed, Scripts), `stage`, `params-rest` (every binding not placed elsewhere), `card` (a titled group of params and features on a 12-column grid) and `tabs` (cards and stages shown one at a time: a card's tab is its title, a stage's tab has a checkbox that turns the stage on; Customize shows them stacked). The default layout's passes are one `tabs` block: First pass, ControlNet, Hires fix, ADetailer.

## Export

**Preview:** a workflow's right-click menu in the workflows window sets `thumb.webp` from the image Generate shows or from a file (`PUT /api/workflows/:id/thumb`: WebP, its own shape, at most 768 px) or clears it (`DELETE`); the old picture moves to the profile's trash. The list gives each workflow's versioned picture URL (`WorkflowSummary.thumb`).

**Export** (a workflow's right-click menu in the workflows window) downloads `<name>.blombo`, a zip (`services/workflows/bundle.ts`): `blombo.json` (`format: "blombo.bundle/1"`), `workflow.json` (with its values, stages and run settings), `prompt.json`, `graph.json`, the linked layout (`layout.json`) and `thumb.webp`. Import it on any machine or profile by dropping it on the workflows window (or Import): a name that's taken becomes "<name> copy", and a layout that's already in the profile is reused instead of added again.
