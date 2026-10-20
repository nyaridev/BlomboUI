# ADR-0014: Generate scripts and the batch runner as groups in the job queue

**Status:** Accepted (built on `phase-4b-roundtrip`; checked against the fake ComfyUI only)
**Date:** 2026-10-20
**Deciders:** nyaridev

## Context

The feature review keeps two "many images from one click" features:

- **Scripts** on the Generate screen: prompt matrix, XY plot, scope thumbnails.
- **Batch tools**: background removal, upscale, captioning, dataset prep, run over a file list or a folder (ADR-0003 already says `kind: "batch"` workflows share one runner).

Both need progress, cancel, a live view in every window, and ComfyUI's events turned into results. The server queue (`services/jobs.ts`) already does all of that for single runs.

## Decision

**One queue, with groups.** A job can carry a `group` (`shared/jobs.ts` → `JobGroup`: id, kind, title, its index and the group's size, a label). `JobQueue.addRuns(manifest, runs)` queues several runs with their own values and seeds; `cancelGroup(id)` drops a group's queued runs and interrupts its running one; the queue emits `started` and `finished` for every job. Two services follow their groups:

- **`services/scripts.ts`** plans a script with `shared/scripts.ts` (pure: cells of value overrides, labels, grid shape; the client uses the same planner to show the count and errors before anything is queued). Every cell runs with the **same seed** unless the seed is an axis. When the last cell of a matrix or XY plot finishes (or is cancelled), the images are fetched from ComfyUI and composited by `lib/grid.ts` (sharp, labels as SVG text, gray "No image" cells for failed runs) into `<outputs>/<date>/grids/<workflow>-<kind>-<time>.png` (the profile's `grids/` without an outputs folder), indexed by the gallery and shown on the image stage as a finished job of kind `grid` (`job.file`, served by `/api/scripts/grids/:id`). Scope thumbnails save each finished image as `data/profiles/<id>/scopes/<scope>/<kind>/<ComfyUI name>.webp` (`services/scopes.ts`); Models → Local and the pickers show the `default` scope's picture for a model without a preview of its own. Models folders are never written.
- **`services/batch.ts`** lists the files (a folder, optionally recursive, or a file list: native multi-pick paths or dropped files staged in `runtime/cache/<profile>/batch-inputs/`), queues one run per file with an **input** (`RunInput`: the queue uploads the file into ComfyUI's `input/blombo/batch/`, named by content, right before the run and points the `image.input` binding at it), and on `finished` copies the images into the output folder as `<name>.png` and writes text outputs (`TEXT_OUTPUT_KEYS` in `workflows/nodes.ts`: a tagger's `tags`, a captioner's `text`) to `<name>.txt` with an optional prefix. One batch at a time; "skip existing" makes a stopped batch resume; a result never replaces the input file, and a file it would replace goes to the profile's trash first. Progress goes over the live bus (`batch` topic: `batch` snapshots and `batch.item` changes); a failing file doesn't stop the rest and isn't sent to the global error list.

**Batch presets** live in `presets/workflows/` like any preset (`kind: "batch"`, an `image.input` binding, results through `PreviewImage` so ComfyUI's outputs folder isn't filled): **Remove background** (Inspyrenet Rembg), **Upscale images** (core nodes), **Caption images** and **Dataset prep** (WD14 Tagger). Their custom node packs are pinned in the manifest's `packs` and installed through the stage mechanism (ADR-0013): the node pack installer now trusts packs listed by stage packages and by the built-in presets folder, never a manifest from a request. `GET /api/batch/check/:id` reports missing packs and models with the same notices as stages.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Groups in the one queue (chosen)** | One place for ComfyUI events, progress, interrupt and cancel; the header queue and every window see scripts and batches like any run | The queue learns about inputs and groups |
| A second queue per feature | Isolated | Two consumers of ComfyUI's socket racing for the same prompt events; duplicated progress code |
| Let ComfyUI batch (send all prompts at once) | Fewer round trips | Wildcards and seeds per run, cancel and per-file results get harder; long batches block Generate |

## Consequences

- A script or batch shows in the header queue and can be stopped with Cancel like any run; the Generate button turns into "Run script" while a script is on.
- Grids and scope thumbnails need the images back from ComfyUI (`/view`), so they work with external ComfyUIs too.
- Picking which scope cards show came in Phase 5 (ADR-0015). Not covered yet: a batch "open output folder" button, several batches at once, running the real Inspyrenet and WD14 packs (their models download on first use; needs the owner's OK).
