# BlomboUI — Architecture

BlomboUI is a local, profile-based studio for ComfyUI. ComfyUI does the work of generating images. BlomboUI makes that work pleasant: profiles, workflows you can import and edit, a Generate screen you can customize, a gallery, model management (local, Civitai, ComfyUI Manager), wildcards, and helpers that ComfyUI does not have.

This document is the map. Decisions and their reasons are in [`adr/`](adr/). The look and feel is in [`design-system.md`](design-system.md). The workflow format is in [`workflows.md`](workflows.md).

## Principles

1. **ComfyUI is the engine, Blombo is the cockpit.** Generation graphs stay real ComfyUI graphs. Blombo never builds a parallel engine. It binds UI to graph inputs, patches graphs with stages, and submits them.
2. **One language, one schema.** TypeScript end to end. Every shape that crosses the wire, or lands on disk, is a Zod schema in `src/shared/`. Nothing is validated twice in two languages.
3. **Workflows are data, not code.** Adding a workflow means dropping a file, not editing Python or TSX. Built-in presets use the same format as user imports.
4. **The UI is data too.** The Generate screen is a layout document. The default layout is one preset among others. Users can move blocks and change control styles, and nothing is hardcoded to one workflow.
5. **Push, don't poll.** One WebSocket carries job progress, previews, GPU stats, downloads, gallery inserts and errors.
6. **Fast by default.** Virtualized grids, cached thumbnails with immutable URLs, lazy views, sliced stores, and no layout thrash in the prompt editor.
7. **Files you can read.** Profiles, settings, workflows and layouts are JSON files in a profile folder. SQLite holds only indexes and logs, which can be rebuilt.

## System overview

```mermaid
flowchart LR
  subgraph Shell["Window"]
    B["Browser tab<br/>(start-web.bat)"]
    T["Tauri window<br/>(start-app.bat)"]
  end
  subgraph Server["Blombo server — Node + Hono :4380"]
    R["/api routes<br/>(Zod-validated)"]
    WS["/api/live<br/>WebSocket bus"]
    SV["services<br/>profiles · workflows · jobs · gallery · models<br/>civitai · downloads · wildcards · autocomplete"]
    PM["ComfyUI supervisor<br/>(spawn · restart · logs)"]
    DB[("profile.sqlite<br/>index + history")]
    FS[["profile folder<br/>profile.json · settings.json<br/>workflows/ · layouts/"]]
  end
  subgraph Comfy["ComfyUI :8188 (own Python + Torch)"]
    CQ["/prompt · /ws · /object_info"]
    BR["blombo-bridge<br/>extension (Save to Blombo)"]
  end
  B & T -->|HTTP + WS| R & WS
  R --> SV --> DB & FS
  SV -->|HTTP + WS client| CQ
  PM -->|child process| Comfy
  BR -->|/api/bridge (CORS: this ComfyUI only)| R
```

- **Server** (`src/server`): Node 22+ running TypeScript directly (type stripping), Hono for HTTP, `ws` for WebSocket, `node:sqlite` for storage, `sharp` for thumbnails and grids. It serves the built client in production.
- **Client** (`src/client`): React 19, Vite, Tailwind 4, TanStack Router and Query, Zustand for UI state, Motion for animation, Floating UI for anything that floats, dnd-kit for layout editing, CodeMirror 6 for YAML and prompts, TanStack Virtual for big grids.
- **Shared** (`src/shared`): vocabulary (roles, model kinds, samplers), Zod schemas (settings, profile, workflow manifest, layout document, API bodies), and pure logic used on both sides (prompt syntax parser, wildcard grammar, resolution math).
- **Desktop** (`src-tauri`): a thin native window that opens the local server URL. The page and the web build are the same. Small platform hooks (open a second window for ComfyUI, native notifications) go through `client/lib/platform.ts`.
- **ComfyUI**: installed per *slot* under `runtime/comfyui/<slot>/` with its own Python (a private venv the in-app installer sets up with uv, or a portable build placed there by hand). Blombo supervises the process, writes `extra_model_paths.yaml` from the active profile, installs the custom node packs stages and batch presets need into `custom_nodes/` (ADR-0013), and keeps the **blombo-bridge** extension (ADR-0009) current there.

## Source layout

```text
BlomboUI-new/
├── start-web.bat / start-app.bat / start-dev.bat   launchers (Windows first; .sh later)
├── src/
│   ├── shared/        constants · schemas · api types · prompt/ · workflow/ · layout/
│   ├── server/
│   │   ├── main.ts        flags (--dev --port --open web|app|none), wiring, single instance
│   │   ├── app.ts         routes + static client
│   │   ├── routes/        one file per area, thin: validate → service → respond
│   │   ├── services/      profiles · settings · comfy/ · workflows/ · jobs · gallery/ · models
│   │   │                  civitai/ · downloads · wildcards · stages · layouts · autocomplete
│   │   │                  live (event bus)
│   │   ├── db/            sqlite open/migrate + repositories
│   │   └── lib/           fsx (safe paths, atomic writes), http (errors), images (sharp)
│   ├── client/
│   │   ├── app/           shell, router, header, avatar menu, view transitions
│   │   ├── features/      profiles · generate · gallery · models · wildcards · fileinfo
│   │   │                  settings · history · errors · help · scopes · workflows · lab
│   │   ├── ui/            design-system controls (hand-built, token-driven)
│   │   ├── icons/         custom SVG icon set
│   │   ├── lib/           api · live (ws) · queries · motion · hotkeys · platform · format
│   │   └── styles/        tokens.css · base.css
│   └── comfy-bridge/      blombo-bridge: __init__.py + web/blombo.js (extension) + web/blombo-core.js
├── presets/
│   ├── workflows/     built-in workflow packages: sd15, sdxl, illustrious; batch: remove-background,
│   │                  upscale, caption, dataset-prep (planned: noobai, anima, krea2)
│   ├── stages/        graph patches per family: hires-*, adetailer-*, controlnet-* (checkpoint,
│   │                  diffusion); upscale later
│   ├── layouts/       built-in Generate layouts (default, compact)
│   └── tags/          the bundled starter tag list for prompt autocomplete
├── src-tauri/         desktop shell
├── tools/             ensure-build · ensure-app · sync-rules · dev-window · make-icons · build-presets
├── docs/              architecture · design-system · workflows · adr/
├── data/              (gitignored) profiles.json + profiles/<id>/
└── runtime/           (gitignored) comfyui/<slot>/, tools/, cache/, logs/, app/
```

## Profiles and storage

```text
data/
├── profiles.json                 registry: ids, order, last opened, "open on launch"
└── profiles/<id>/
    ├── profile.json              name, avatar, accent, paths (models, outputs, wildcards), comfy slot
    ├── avatar.webp
    ├── settings.json             everything in Settings (Zod-validated, versioned, migrated)
    ├── secrets.json              the Civitai API key (never sent to the client)
    ├── workflows/<workflowId>/   workflow.json · graph.json · prompt.json · thumb.webp
    ├── layouts/<layoutId>.json   Generate layouts (workflows link one by id)
    ├── inputs/<sha>.<ext>        ControlNet images, named by content, sent to ComfyUI per run
    ├── tags/<name>.csv           tag lists added in Settings → Autocomplete
    ├── scopes/<scope>/<kind>/    scope thumbnails (<ComfyUI model name>.webp, from the script)
    ├── grids/<date>/             script grids when the profile has no outputs folder
    ├── trash/                    workflows/ (also <id>-before-edit-<stamp>/) · layouts/ · tags/ ·
    │                             gallery/<id>/<file> · wildcards/<stamp>/<path> · batch/<run>/
    └── blombo.sqlite             gallery index (FTS5) + favorites + trash list, downloads,
                                  Civitai views and searches, model hashes and lookups,
                                  tag usage (frequent tags)
runtime/cache/<id>/thumbs/        gallery/ and models/ WebP thumbnails (safe to delete)
runtime/cache/<id>/batch-inputs/  images dropped into the batch runner (named by content)
runtime/cache/civitai/            api/ answers and images/ (the image proxy), safe to delete
runtime/cache/manager/            the ComfyUI model catalog (model-list.json), a day at a time
runtime/comfyui/<slot>/           managed ComfyUI: ComfyUI/ (custom_nodes/blombo-bridge) · .venv/ · blombo/
runtime/tools/                    uv, its Python downloads and package cache (installer)
runtime/app/                      the desktop window's WebView2 profile and window.json

Everything BlomboUI writes stays in its folder: it has no installer and never writes to AppData
or the registry (ADR-0002). Moving the folder moves the app.
```

- The first launch opens the **profile screen**. Creating a profile walks through name, avatar, folders, ComfyUI slot, theme and starter workflows.
- Opening a profile is a **hot switch**. The server closes one profile's database and opens the next. ComfyUI restarts only when the models folder changes, because ComfyUI reads `extra_model_paths.yaml` at startup.
- Models, outputs and wildcards folders belong to the profile. Two profiles may point at the same folders.
- `settings.json` holds everything Settings edits (UI font, gallery layout and tile size, extra gallery libraries, NSFW blur), one Zod field with a default each (`shared/settings.ts`). A PATCH sends only the sections it changes; the server merges and validates the whole file.

## Library (gallery, File Info, models, wildcards)

- **Gallery index** (`services/gallery/`): the outputs folder is the first library; extra folders are added in the gallery sidebar (stored in settings). A **sync** walks each library, skips files whose size and mtime match the index, reads the rest *header-only* (`lib/imagemeta.ts`: PNG text chunks, WebP/JPEG EXIF; pixels are never decoded) and drops rows for files that are gone. It runs on profile open and on demand, with progress on the live bus. Rows hold the parsed summary (prompt, model, LoRAs, seed, sampler…) from Blombo's own chunk, ComfyUI's prompt graph (`workflows/summary.ts` uses the analyzer, so roles not class names) or A1111 parameters (`shared/imageinfo.ts`).
- **Search** uses SQLite FTS5 with the trigram tokenizer (substring matches anywhere in prompts); terms shorter than three characters, or a SQLite without FTS5, fall back to `LIKE` on the same text. Filters: library, favorites, model, LoRA, date; sorts: newest, oldest, name.
- **Favorites and the trash** live in their own tables keyed by library + path, so a rebuilt index keeps them. Removing an image moves the file into the profile's trash folder; restore moves it back (to a free name if the spot is taken). Only Blombo's own trash is ever emptied.
- **Thumbnails** (`lib/thumbs.ts`, sharp) are made on first request, a few at a time, keyed by source path + size + mtime, and served with `immutable` caching; a changed file gets a new URL. sharp's file cache is off so Windows never holds a user file open.
- **Live inserts:** each `job.image` from the queue is indexed as it lands (when it's in the outputs folder) and pushed as `gallery.added`; lists showing everything newest-first put it on top, filtered lists count it.
- **Use these settings** (`features/generate/applySettings.ts`): an image Blombo made switches to the workflow that made it and loads its values; anything else fills the active workflow's parameters by role. Choices the workflow can't take are skipped and named.
- **File Info** reads uploaded images on the server and `.safetensors` headers anywhere (a dropped file uploads only its header; `shared/safetensors.ts` parses kohya `ss_*` and `modelspec.*` metadata). Images with a ComfyUI graph can be imported as workflows through the normal import.
- **Local models** (`services/models.ts`): the models root is scanned per kind (`MODEL_FOLDERS`, including ComfyUI's alias folders) with sidecars next to each file: a preview image (thumbnail), `.civitai.info` and A1111 `.json` (name, base model, trigger words, NSFW flag, notes). Rename and move take the sidecars along and never overwrite. NSFW thumbnails are blurred until clicked (`settings.models.blurNsfw`, on by default).
- **Wildcards** (`services/wildcards.ts`): `.txt` files (one option per line) and YAML files (nested keys, list leaves; keys are global) resolve `__name__` references for Generate and the Wildcard Manager. Saving is atomic and refuses a file that changed on disk since it was opened; deleting moves to the profile's trash. The roll preview runs the same seeded expansion as the compiler, with the editor's unsaved text.

ADR [0011](adr/0011-gallery-index.md) (gallery index) · ADR [0010](adr/0010-in-app-comfyui-installer.md) (installer) · ADR [0013](adr/0013-stage-custom-node-packs.md) (custom node packs).

## Online (Civitai, downloads, Manager store, History)

- **The client never talks to Civitai.** `services/civitai/` calls Civitai's API v1 with the profile's key (`secrets.json`; the API reports only whether one is set and its last four characters), caches answers in memory and `runtime/cache/civitai/api/` keyed by which key asked, and normalizes them into `shared/civitai.ts` shapes. Descriptions are parsed into plain blocks (`shared/richtext.ts`) and rendered as React elements. Every picture goes through the image proxy, `/api/civitai/image?u=…`: Civitai's hosts only (checked at each redirect), image bytes only, cached in `runtime/cache/civitai/images/` with immutable caching. `lib/remote.ts` follows redirects by hand so the key is sent only to Civitai's own origin.
- **Models → Civitai:** a filter bar (search, types, base model, sort, period, NSFW), recent searches and saved filters (settings), a virtualized grid of the one ModelCard that loads pages as you scroll, and opened model tabs. A model page has an image carousel, the version picker, files, trigger words, the description and **Download** with a preview of where the file lands. Marks ("Installed", "Update", "Downloading") come from the models folder and the live queue.
- **Downloads** (`services/downloads.ts`, ADR-0012) are a server queue: a few at a time, progress on the bus, each file written to `<target>.part` next to where it lands and resumed with range requests, Civitai's SHA256 checked, never overwriting (`lib/fsx.ts`: `openPartFile`, `commitPart`, `writeFileIfAbsent`). Civitai files land in `<kind>/<base model>/<category>/<creator>/<name>` per Settings → Civitai (`shared/downloads.ts`, pure) with `.civitai.info` and `.preview.png` next to them. Every download is a row in the profile database; unfinished ones come back paused. The header shows a downloads chip beside the generation queue.
- **Lookup by hash** (`services/lookup.ts`): local models without a Civitai info file are hashed in the background, smallest first, and looked up on Civitai; answers live in the profile database (by path + size + mtime) and fill names, thumbnails, base models and trigger words in Models → Local and the Generate pickers. Nothing is written next to the models.
- **Models → Manager** (`services/manager.ts`): ComfyUI-Manager's `model-list.json` (cached a day, used offline) as a store with categories, sizes and installed state; Install goes through the same queue into the folder the catalog names.
- **History** (avatar menu): every download with retry, show in Models, reveal and its Civitai page; the Civitai models you opened; your searches. Limits are in Settings → Civitai.
- **Checks without the real site:** `services/civitai/fixtures/fake-civitai.ts` serves the API, images, ranged downloads, an early-access file and a catalog; `--civitai` and `--catalog` point the server at it.

ADR [0012](adr/0012-civitai-proxy-and-downloads.md).

## Workflows (the core)

A **workflow package** is a folder holding a real ComfyUI graph and a **manifest** that binds UI to graph inputs.

```text
workflow.json   manifest: name, kind, bindings[], values{}, stages{}, layout, outputs[]
graph.json      ComfyUI UI format (nodes + links). Used for "Edit in ComfyUI"
prompt.json     ComfyUI API format (class_type + inputs). Used to run
```

**Import** accepts a ComfyUI API JSON, a UI JSON, a ComfyUI PNG or WebP with embedded metadata, or a `.blombo` bundle. The **analyzer** reads the graph with ComfyUI's `/object_info`. It finds semantic **roles** such as `prompt.positive`, `model.checkpoint`, `sampler.steps`, `latent.width` and `lora.stack`, and exposes inputs of nodes titled `$Something`. Today the workflow is saved straight away and the findings (missing nodes or models) are shown as a notice; a setup screen to confirm roles comes later.

**Running** compiles the package:

```text
prompt.json → apply values to bindings → expand wildcards → <lora:…> tags into the LoRA stack
→ splice enabled stages at the ports (controlnet → base → hires → adetailer units)
→ seed → filename prefix → POST /prompt
```

**Editing in ComfyUI**: "Edit in ComfyUI" opens ComfyUI in a new window with an edit session (a single-use token, ADR-0009). The bundled **blombo-bridge** extension loads the canvas with the workflow's current values and shows Save to Blombo, Save as copy and Cancel. Saving sends the UI and API graphs back; Blombo re-runs the analyzer and re-syncs (`workflows/resync.ts`): values follow their parameters by (node, input), (class_type, title, input) or role, a value changed in ComfyUI wins, and added and removed parameters are reported. Every window hears about it over the live bus. Without a session, **Send to Blombo** imports any canvas.

**Templates are gone.** Values live in the workflow. **Duplicate** creates a sibling package with a new name, and changes stay local to that copy. **Export** writes a `.blombo` zip: manifest, graphs, linked layout, thumbnail.

**Scripts and batch** (ADR-0014): the Generate screen's Scripts block turns one click into a prompt matrix, an XY plot or scope thumbnails; `kind: "batch"` workflows show the batch runner instead of the prompts. Both queue groups of runs in the one server queue (`JobGroup`); `services/scripts.ts` composites grids and files scope thumbnails, `services/batch.ts` uploads each input file and writes results and sidecar captions into the output folder.

Details: [`workflows.md`](workflows.md) · ADR [0003](adr/0003-workflow-packages.md) · ADR [0004](adr/0004-stages.md) · ADR [0009](adr/0009-comfy-bridge.md) · ADR [0014](adr/0014-scripts-and-batch-runner.md).

## Generate screen = layout document

The Generate view renders a **layout**: regions (`models`, `prompt`, `actions`, `params`, `stage`) that hold **blocks**. A block is a bound parameter with a control variant (slider, number, segmented, select, chips, switch…), a feature block (LoRA strip, resolution picker, seed, Hires, ADetailer, ControlNet, image stage, queue), or a container (card, collapsible, tabs, row).

- Blocks bind by **role or binding id**, so one layout works across workflows. A block whose binding a workflow lacks simply doesn't render.
- **Customize** mode adds drag handles and an inspector (control style, size, width, label position, visibility). Layouts are files in the profile (`services/layouts.ts`): picking one links it to the workflow, **Reset to default** unlinks it, and the workflow's response carries the layout it shows.
- **Stages** (`features/generate/blocks/stages/`): Hires fix, ADetailer and ControlNet blocks keep their settings with the workflow's values (`useValues().stages`, saved by the same debounced PATCH and sent with Generate). Each block asks `POST /api/stages/check` (debounced, refetched when models or custom nodes change) what's missing and which models ComfyUI offers, and shows notices with the fix. The image stage splits progress into the run's segments.
- **Prompt autocomplete** (`features/generate/promptAssist.ts`, `services/autocomplete.ts`): CodeMirror asks the server as you type; the server searches the tag lists (bundled `presets/tags/*.csv` plus the profile's `tags/`, parsed once and kept sorted by popularity), LoRAs with their trigger words and thumbnails (Models → Local), wildcards, and the tags you generate with most (counted per click in the profile database). Ctrl+↑/↓ changes the weight at the cursor (`shared/prompt/weight.ts`). Settings → Autocomplete holds the sources, lists and insert behavior.

ADR [0005](adr/0005-layout-documents.md).

## Live bus

`/api/live` is a single WebSocket per window (`services/live.ts` on the server, `lib/live.ts` on the client). Messages are the `ServerMessage` union in `shared/live.ts`. A window subscribes to topics:

| Topic | Messages |
|---|---|
| `comfy` | `comfy.status`: running / starting / stopped / crashed / missing / unreachable, with a message that says what to do |
| `system` | `system`: GPU name, VRAM, temperature and load at 1 Hz, sampled only while a window is visible (`nvidia-smi -lms 1000`, else ComfyUI's `/system_stats`) |
| `jobs` | `queue` snapshots on every change, `job.progress` per step, `job.image` as outputs land, and binary preview frames |
| `logs` | `comfy.log` batches, only while a log view is open |
| `gallery` | `gallery.added` (a new image, indexed), `gallery.changed` (lists should refetch), `gallery.sync` (scan progress), while a gallery view is mounted |
| `install` | `install`: the ComfyUI installer's steps, progress and log, while Settings → ComfyUI is open; `nodes.install`: the custom node installer's, while a "needs custom nodes" notice is shown |
| `downloads` | `downloads` queue snapshots on every change, `download.progress` byte counts at 4 Hz (every window follows it: the header shows the queue) |
| `batch` | `batch` (the run started, finished or stopped) and `batch.item` (one file changed), while a batch workflow is open |
| (all) | `hello` on connect (with the download queue), `error`, `profile.switched`, `models.changed` (model files renamed, moved, downloaded or matched on Civitai), `models.lookup` (background hashing progress), `workflow.saved` (a workflow came back from ComfyUI: lists refetch, the open one reloads, a toast says what changed) |

Preview frames are binary: a 4-byte job sequence number, 1 byte for the image type, then ComfyUI's JPEG or PNG preview bytes unchanged. A window whose socket is backed up skips frames.

ADR [0008](adr/0008-live-bus.md).

## Client architecture

- **Routing**: TanStack Router. `/` is the profile screen. `/p/:profile/*` holds the app. Generate and Gallery stay mounted (kept alive and hidden) so switching tabs is instant. Other views load lazily.
- **State**: server data lives in TanStack Query (keys in `lib/queries.ts`, profile-scoped keys include the open profile id). UI state lives in small Zustand slices per feature (`generate/state.ts`), never one giant store. Live data lives in the `useLive` store (`lib/live.ts`); components select single values so a progress tick doesn't re-render lists. Generate values persist to the workflow through a debounced PATCH; the Generate request carries them too, so a click never waits for a save.
- **Design system**: `ui/` holds hand-built controls on tokens. Behavior comes from Floating UI (positioning, dismiss, focus, list navigation) and native elements. Motion presets are in `lib/motion.ts`. No component library styling. ADR [0007](adr/0007-design-system.md).
- **Performance**: TanStack Virtual for the gallery (rows of exact height, so nothing is measured), model grids, the wildcard tree and line lists; the gallery loads pages of 300 as you scroll; thumbnails come from `/api/gallery/thumbs/:id?v=…` and `/api/models/thumb?id=…&v=…` with immutable caching; the prompt and wildcard editors use CodeMirror decorations instead of overlay mirroring; previews decode with `createImageBitmap` off the main paint.
- **UI font**: `--font-ui` in `tokens.css`, switched by `<html data-font>` (Geist and Inter bundled, Segoe UI and the system font from Windows) or set inline for a custom installed font. Tailwind's `font-sans` reads it, so the whole app follows at once; numbers and code stay in Geist Mono.

## Server architecture

- Routes are thin: parse with Zod, call a service, return JSON. Errors are thrown `HttpError`s.
- Services own one concern each. Long work (hashing, gallery sync, downloads, thumbnail generation) runs on a small task runner with progress events on the bus.
- The **ComfyUI supervisor** (`services/comfy/supervisor.ts`) follows the open profile's target. A **managed slot** (`runtime/comfyui/<slot>/` with `ComfyUI/main.py` and its own Python) is started with `--extra-model-paths-config` (written from the profile's models folder), `--output-directory` (the outputs folder), `--preview-method auto` and, for a CPU-only PyTorch, `--cpu`, on the first free port from 8188; its stdout and stderr become the log (terminal colors stripped). An **external** ComfyUI is only connected to, and Blombo keeps reconnecting while it's away. In dev mode a managed ComfyUI outlives server restarts and is re-adopted from `blombo/comfy.pid`, so editing server code doesn't reload models. A missing slot reports `missing`, and the header offers **Install**. Before a slot starts, the supervisor's `prepareSlot` hook copies the current blombo-bridge into its `custom_nodes/` (ADR-0009).
- The **installer** (`services/comfy/installer.ts`, ADR-0010) installs a slot from Settings → ComfyUI with a progress view: uv, a private Python 3.12 venv, the ComfyUI release zip, PyTorch (CUDA 12.8 or CPU), ComfyUI's requirements, then a check that writes `blombo/slot.json`. Steps skip finished work, so an interrupted install resumes; `blombo/installing` marks a slot unfinished so the supervisor won't start it.
- The **custom node installer** (`services/comfy/nodepacks.ts`, ADR-0013) puts the packs a stage needs into the managed slot from the stage notice: the pinned source zip into `custom_nodes/`, ComfyUI stopped, the pack's requirements with uv (PyTorch pinned), ComfyUI started again and its node list checked. Both installers share `services/comfy/uv.ts`.
- The **job queue** (`services/jobs.ts`) is server-side and survives a page reload. Each click queues runs (one ComfyUI prompt each, with its own seed per the seed mode); the queue compiles and submits one at a time, so wildcards and seeds are fresh per run. Interrupt stops the running image, Cancel also clears the queue and "generate forever". A validation error from ComfyUI is rewritten with the workflow's labels ("… isn't in your checkpoints folder") and stops the rest of that batch. Scripts and the batch runner add **groups** of runs (`addRuns`, each with its own values, seed and input files uploaded right before it runs), cancel them as a group, and follow them through the queue's `started` / `finished` events (ADR-0014). Reordering comes later.

## Scope

The full feature inventory, grouped by area with keep / later / drop decisions, is the feature review page ([`review/features.html`](review/features.html), also published for review). Templates are not part of the product: workflow values and Duplicate replace them. Everything here is written fresh for this codebase.
