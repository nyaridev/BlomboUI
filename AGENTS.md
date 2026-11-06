# AGENTS.md: BlomboUI

BlomboUI is a local, profile-based studio for **ComfyUI**. ComfyUI generates; BlomboUI gives it profiles, importable workflows, a Generate screen you can customize, a gallery, model management (local, Civitai, ComfyUI Manager), wildcards and helpers. It runs in the browser (`start-web.bat`) or a desktop window (`start-app.bat`, Tauri).

This file is the source of truth for every coding agent (Claude Code, Cursor, Codex…). Area rules live in `.claude/rules/` and are mirrored to `.cursor/rules/`. Specs:

- `docs/architecture.md`: the map (start here)
- `docs/design-system.md`: tokens, type, motion, icons, components, copy
- `docs/workflows.md`: workflow packages, roles, import, stages, compile
- `docs/adr/`: decisions and why (0001–0019, all accepted and built)
- `docs/review/features.html`: the feature inventory with the owner's keep / later / drop decisions
- `docs/status.md`: what's built, what was verified and how, and the phase roadmap
- `docs/performance.md`: measured numbers (20k-image gallery, startup bundle) and how to repeat them
- `docs/review/real-comfyui-checks.md`: the checks on a real ComfyUI (2026-10-21): results, downloads, findings

## Commands

| Command | What |
|---|---|
| `start-web.bat` / `npm run start` | Build the client if needed, serve on :4380, open the browser |
| `start-app.bat` / `npm run start:app` | Same, in the Tauri window (builds it once; needs Rust) |
| `start-dev.bat` / `npm run dev` | API on :4381 (`node --watch`) + Vite on :4382 with HMR |
| `npm run dev:app` | Dev mode inside the desktop window |
| `npm run check` | **typecheck + lint + tests + rules sync check. Run before you finish** |
| `npm run typecheck` / `lint` / `format` / `test` | Individually (TypeScript 7, Biome, Vitest) |
| `npm run rules:sync` | Regenerate `.cursor/rules/*.mdc` from `.claude/rules/*.md` |
| `node tools/make-icons.ts` | Regenerate desktop icons from `src-tauri/app-icon.svg` |
| `node tools/build-presets.ts [--comfy <url>]` | Rebuild built-in presets' bindings and `graph.json` from their `prompt.json` |
| `node --expose-gc tools/bench-gallery.ts [--images 20000] [--dir runtime/bench-gallery] [--keep]` | Gallery benchmark: a throwaway library of ComfyUI-style PNGs, first index, resync, list and search latency, thumbnails and memory through the real routes. Numbers live in `docs/performance.md`. It only clears a folder it made |
| `node src/server/services/comfy/fixtures/fake-comfy.ts --port 8297 --step-ms 120 [--output-directory DIR]` | A fake ComfyUI (no GPU): point a throwaway profile at it (external URL) to try Generate end to end. With an output directory it writes each image there (with metadata), so the gallery's live inserts work too. Its `/object_info` includes the Impact Pack, Impact Subpack and controlnet_aux nodes the stages use and the batch presets' nodes (with `--custom-nodes DIR`, only the packs whose folder is in DIR); it takes `/upload/image`, answers `GET /queue` (and tests can drop its sockets: `dropSockets()`), reports progress per sampler node (so stage segments show), keeps Preview Image results as temp images, returns tags for tagger nodes, and `/view` serves the images it wrote. With `--custom-nodes`, `/` is a stand-in ComfyUI page that loads custom nodes' web extensions (blombo-bridge) |
| `node src/server/main.ts --dev … --fake-comfy` | Dev checks only: managed slots run the fake ComfyUI (with `--custom-nodes` on the slot's `custom_nodes/`), and custom node installs use fake downloads and a fake uv (`services/comfy/fixtures/fake-install-ops.ts`). Make a slot by hand in the throwaway runtime (`comfyui/<slot>/ComfyUI/main.py` and `.venv/Scripts/python.exe`, both empty) to click through **Install** on a stage or batch notice. The slot gets blombo-bridge on start, so **Edit in ComfyUI** opens the fake ComfyUI page with the bridge's bar (Save to Blombo, Save as copy, Send to Blombo) |
| `node src/server/main.ts --dev --port 4391 --data <tmp> --runtime <tmp>` + `BLOMBO_API_PORT=4391 BLOMBO_WEB_PORT=4392 vite` | A second, throwaway dev instance (own profiles, slots and caches) next to one that's already running |
| `node src/server/services/civitai/fixtures/fake-civitai.ts --port 8298 [--slow <bytes/s>] [--file-kb N]` | A fake Civitai and model catalog (API, images, 120 community posts per version, paged, by sort and period (none for versions ending in 3), ranged downloads, an early-access file, the site search that date ranges use, and `/api/v1/enums` with a few base models the built-in list lacks). Start the server with `--civitai http://127.0.0.1:8298 --catalog http://127.0.0.1:8298/catalog/model-list.json --huggingface http://127.0.0.1:8298` to browse and download without the real site (the last one answers the catalog's download counts); its API key is `FAKE_KEY` in that file |

## Architecture map

```text
src/
├── shared/       Vocabulary + Zod schemas + pure logic used by both sides
│                 constants · profile · settings · api · comfy · jobs · live · random
│                 gallery · imageinfo · fileinfo · safetensors · models · scopes · basemodels (groups) · wildcards · install
│                 civitai · richtext (HTML → safe blocks) · downloads (destinations) · manager
│                 autocomplete (tag CSV, prompt context, formatting) · bridge (edit sessions)
│                 dev (the Saved data view) · savepaths (Settings → Saving's path patterns)
│                 scripts (matrix / XY planner, thumbnails without UI) · batch (runner shapes)
│                 compare (saved comparisons: every combination of any number of axes)
│                 history (job log, usage stats, snippets, model marks)
│                 shortcuts (actions, defaults, combos)
│                 salvage (read saved data value by value: clamp, default, drop one item)
│                 layout/schema · workflow/{roles,manifest,graph,stages,packs}
│                 prompt/{tokenize,loras,wildcards,weight,explain,instant,renames}
├── server/       Node 22+ running TypeScript directly (type stripping) + Hono
│   ├── main.ts       flags (--dev --port --open web|app|none --data --runtime --civitai --catalog --huggingface)
│   ├── context.ts    builds the services and wires their events together
│   ├── app.ts        /api routes + built client in production
│   ├── routes/       thin: validate (Zod) → service → JSON
│   │                 profiles · system · settings · comfy · workflows · jobs · wildcards
│   │                 gallery · models · fileinfo · civitai · downloads · manager
│   │                 stages · layouts · autocomplete · bridge (/api/bridge, CORS) · scripts · batch
│   │                 compare
│   │                 history (job log, errors, prompts, stats, snippets, model marks)
│   ├── services/     profiles · settings · system · window · live (bus) · jobs (queue)
│   │                 wildcards · models · fileinfo · downloads (queue) · lookup (hash → Civitai)
│   │                 manager (ComfyUI model catalog) · stages (packages, control images,
│   │                 checks, map preview) · layouts (profile layouts/) · autocomplete (tag lists,
│   │                 LoRAs, wildcards, frequent tags) · bridge (edit sessions, Save to Blombo)
│   │                 scripts (groups → grids, thumbnails) · batch (the batch runner)
│   │                 compare (comparisons in the profile's compare/, their runs and results)
│   │                 outputs (after ComfyUI saves: format, JPEG copies, where grids and stopped
│   │                 runs' images go) · modelthumbs (a model's pictures in <model>_data/thumbs/) · scopes (scopes.json) · wildcardpics (pictures you
│   │                 set for wildcards) · leftovers (Settings → Leftovers) · history (job log, error log,
│   │                 stats, model marks) · timing (RunClock: time and it/s per stage) · snippets
│   │                 backup (profile export / import zip) · workflowcheck (what a workflow needs
│                 that ComfyUI doesn't have, and the fixes) · nodemap (ComfyUI-Manager's
│                 node → repository map) · devinfo (the Saved data view:
│   │                 folder, tables, an image's raw metadata; its /api/dev routes exist in dev mode only)
│   │   ├── comfy/        supervisor · client · stats · paths · slots · installer (slots, progress)
│   │   │                 nodepacks (stage custom nodes into a slot) · uv (shared by both installers)
│   │   │                 bridge (copy blombo-bridge into custom_nodes) · fixtures/fake-comfy(-page)
│   │   ├── civitai/      api (cached client) · images (proxy) · normalize · fixtures/fake-civitai
│   │   ├── gallery/      index (sync, search, favorites, trash, libraries) · meta · home ·
│   │   │                 imports (Add to gallery: imported/, civitai/ + sidecars) · files (reading
│   │   │                 files for the index: images, animations, videos, audio)
│   │   └── workflows/    store · analyze (roles, ports) · convert · import · compile · loras · health
│   │                     stages (the splicer) · presets · nodes · summary · resync · bundle (.blombo)
│   ├── db/           profileDb (node:sqlite, migrations, FTS5 trigram) · ProfileDbs (shared connections)
│   └── lib/          fsx (atomic, queued writes; movePath; resolveInside; part files) · saveformat
│                     (PNG / JPEG / WebP with the generation data as EXIF strings) · http (readJson,
│                     readBody, readBodyToFile) · send · guard (only Blombo's own pages may call /api)
│                     remote (redirects by hand, key only to its origin, image sniffing)
│                     emitter · imagemeta (header-only PNG/WebP/JPEG) · mediameta (MP4, FLAC, WAV) ·
│                     exif · thumbs (sharp; video frames through ffmpeg when it's there) · ansi
│                     grid (labeled script grids, sharp)
├── client/       React 19 · Vite 8 · Tailwind 4 · TanStack Router/Query · Zustand · Motion ·
│   │             Floating UI · CodeMirror 6
│   ├── app/          router · Shell (keep-alive views) · header/ · theme · commands (actions the
│   │                 palette and shortcuts run) · Palette (Ctrl+K) · useShortcuts
│   ├── features/     profiles · generate · compare (Generate's sub-view) · gallery · fileinfo ·
│   │                 models (local, civitai/, Manager) · scopes (view, scope bar, pick)
│   │                 wildcards (Models → Wildcards: View, Editor) · settings · downloads ·
│   │                 history (generations, downloads, Civitai)
│   │                 errors · help (guide, playground) · lab (Design Lab, style only) ·
│   │                 storage (Saved data: the profile's files, tables, formats and image
│   │                 metadata, explained; dev only, avatar menu) · preview
│   ├── ui/           the design system (hand-built controls). Import from "@client/ui"
│   ├── icons/        hand-drawn SVG icon set + Logo
│   ├── lib/          api · queries · session · live (bus client) · motion · platform · hooks
│   │                 number · seeded · cn · fuzzy (palette matching) · notifications (OS notes)
│   └── styles/       tokens.css (all raw colors) · index.css (Tailwind theme) · base.css ·
│                     contrast (+ test: text contrast in every theme × accent)
└── comfy-bridge/ blombo-bridge, the ComfyUI extension (ADR-0009): __init__.py + web/blombo.js +
                  web/blombo-core.js (plain JS; tests import the core through its .d.ts)
src-tauri/        Desktop shell: native window on --url, capability for localhost IPC; app-icon.svg is
                  the icon source (node tools/make-icons.ts)
assets/brand/     README banners (light, dark) with the drawn wordmark
presets/          workflows/ (sd15, sdxl, illustrious; batch: remove-background, upscale, caption,
                  dataset-prep) · stages/ (hires, adetailer, controlnet ×
                  checkpoint/diffusion) · layouts/ (default) · tags/ (starter list)
tools/            ensure-build · ensure-app · dev-window · sync-rules · make-icons · build-presets ·
                  bench-gallery
data/             (gitignored) profiles.json + profiles/<id>/   ← user data, never commit
runtime/          (gitignored) ComfyUI slots, tools, caches, logs, app/ (desktop window data)
```

**Data flow:** client → `/api` (Zod-validated) → service → files in `data/` and ComfyUI's HTTP API. Live state comes back over one WebSocket per window, `/api/live` (ADR-0008): ComfyUI status, GPU stats at 1 Hz, queue snapshots, step progress, binary preview frames, errors, and ComfyUI's log while a log view is open. The server owns the single ComfyUI socket (`services/comfy/client.ts`) and fans it out (`services/live.ts`); the client keeps it in `lib/live.ts`.

**What an image carries:** ComfyUI writes its `prompt` (API graph: LoRAs are loader nodes, models by file name) and `workflow` (canvas) chunks; Blombo adds a `blombo` chunk (`BlomboImageMeta` in `shared/imageinfo.ts`: workflow, seed, values, the prompts as they ran, and `models`: every model file the run used with its SHA256 and Civitai ids, `services/workflows/modeluse.ts`). Hashes come from the model list (`LocalModel.sha256`: the .civitai.info or the lookup's `model_hashes`); a model used without one is hashed after the run (`lookup.hashLater`). Reading an image, `summary.hashes` and `summary.civitai` carry them, so links find a renamed file by hash. The Saved data view (avatar menu, dev mode) shows them for any gallery image.

**Generating:** the Generate button posts the current values and stage settings to `/api/jobs`. The server queue (`services/jobs.ts`) compiles one run at a time (`workflows/compile.ts`: values → wildcards → LoRA tags → instant LoRAs (`shared/prompt/instant.ts`: the workflow's `loras.instant` value; their trigger words go at the start or end of the positive prompt, per LoRA) → stages spliced at the ports → seed → filename prefix (Settings → Saving's patterns, `shared/savepaths.ts`: `<workflow>/images/<day>/blombo` by default; grids go to `<workflow>/grids/<day>/`, a stopped run's images move to `<workflow>/interrupted/<day>/` and JPEG copies of large images to `<workflow>/jpeg/<day>/`; the gallery tells them apart by each pattern's fixed folder, `markerOf`); its `shown` texts are the prompts as they ran, wildcards resolved and trigger words in, without `<lora:…>` tags (the graph's loaders record the LoRAs): they go into the image (`extra_pnginfo.blombo.prompts`, what the gallery and File info show) and the job log's `final_prompt` / `final_negative`, which the run info under the image shows), uploads ControlNet images, sends it to ComfyUI and turns its socket events into progress (split into segments: base passes, then each stage), previews and images. Each saved image goes through `services/outputs.ts` before the job takes it (converted to JPEG or WebP when that's the format, with the prompt, workflow and Blombo record as EXIF strings, `lib/saveformat.ts`; a JPEG copy when it's large), and the run's `finished` event waits for that. A plain click that makes several images gets a **batch grid** (`ScriptService.followClick`, as square as they go, at most `saving.grids.maxImages` each); every grid is saved in the grids format where the grids pattern says. The queue lives on the server, so reloads and other windows see the same thing; the header's queue chip (`app/header/QueueChip.tsx`) lists it, and the waiting runs drag into another order (`queue.reorder`, `PUT /api/jobs/order`; the running one never moves). Stage blocks ask `/api/stages/check` what's missing before you run. With a **script** on (Scripts block: prompt matrix, XY plot; `shared/scripts.ts`), the same button queues a **group** of runs with one seed; `services/scripts.ts` puts a matrix or plot into a labeled grid (`lib/grid.ts`; an XY plot that keeps only its grid runs its cells as previews: `compile`'s `preview`). The planner's thumbnails script (each image saved as its model's picture, `services/modelthumbs.ts`) has no UI for now. **Image to image and inpaint** are the `source` stage (`presets/stages/source/`, `SourceSettings` in `shared/workflow/stages.ts`): the First pass tab's menu (`ParamsColumn.tsx`; the card's `features/generate/blocks/Source.tsx` holds the image, denoise and mask) picks Text to image, Image to image or Inpaint; the image is a stage image, the mask is painted in `ui/MaskPainter` and saved as one too, and the stage replaces the main sampler's latent input (the `START` port) and sets its denoise (`base` in `stage.json`). **Compare** (`/p/<id>/compare`, from the header's Generate tab menu; `shared/compare.ts`, `services/compare.ts`, `features/compare/`) is the many-axes version: a saved comparison (`compare/<id>.json` in the profile) keeps the settings it starts from and any number of rows, each an XY-plot axis (`AxisDraft`, `axisFromDraft`, `axisCells` in `shared/scripts.ts`); starting it queues every combination (`planCompare`, at most 500) as one group with one seed and the comparison's own values and stages, and each result keeps its key (the axes' values, in any order) and the gallery's record of its image, so adding a value later only runs the new combinations. Results are a grid with any two rows across and down and the others picked one value at a time, zoom, the full-screen viewer and `ImageCompare` (flip, slider, side by side) for two picks. Its live messages (`compare`, `compare.result`) go to the `compare` topic. `kind: "batch"` workflows show the **batch runner** instead (`services/batch.ts`): one queued run per input file, results and sidecar captions written to the output folder (ADR-0014).

**Round trips with ComfyUI:** Edit in ComfyUI asks `/api/workflows/:id/edit-session` for a single-use token and opens ComfyUI with it; the blombo-bridge extension (`src/comfy-bridge/`, copied into managed slots before they start) loads the canvas and calls `/api/bridge/*` (CORS for that ComfyUI only) to save back; `services/workflows/resync.ts` carries values over and reports what changed, and `workflow.saved` on the live bus updates every window (ADR-0009). Export / import of `.blombo` bundles: `services/workflows/bundle.ts`.

**Scopes (ADR-0019):** off by default; avatar menu → Scopes (`features/scopes/ScopesView.tsx`) turns them on and makes, edits and deletes the profile's scopes (`scopes.json`, `services/scopes.ts`; each scope a random 12-hex id, a name, an optional group, prompt tags). A model keeps its pictures in `<model>_data/thumbs/`: `global.*` for everyone, `<id>.*` per scope and `<id>+<id>.*` per combination (ids sorted, `pictureKey` in `shared/scopes.ts`); the list carries them as `LocalModel.pictures`. The scope bar (`features/scopes/ScopeBar.tsx`, beside Models → Local's and the pickers' filters) picks scopes, each required or optional, or Auto from the Generate prompt's tags; `ScopeFollower` (Shell) works out the pick and cards show `pickPicture`'s choice, else the global picture. The model info dialog's Picture for sets a picture for any scopes. Deleting a scope moves its pictures to the trash.

**Workflow check (ADR-0018):** `POST /api/workflows/:id/health` (with the models picked on screen) (`services/workflowcheck.ts` on the pure `workflows/health.ts`) lists the custom nodes a workflow needs that ComfyUI doesn't have, grouped by pack (a pack Blombo pins, the repository ComfyUI saved on the node, ComfyUI-Manager's node map, else unknown), the model files it names that ComfyUI doesn't list (a download from the Manager's catalog or a Hugging Face link the workflow carries), and whether the canvas has nodes an import left out. Generate shows it above the prompt (`features/generate/WorkflowCheck.tsx`). Installs go through the stage installer as confirmed packs, after a dialog that says where each comes from; unknown classes take a pasted GitHub repository; Rebuild converts the canvas again.

**Generate screen:** the params column is a layout document; built-in layouts are in `presets/layouts/`, the profile's in `layouts/`, and a workflow links one (`manifest.layout`; `GET /api/workflows/:id` returns the layout it shows). The prompt editor's autocomplete asks `/api/autocomplete` (tag lists in `presets/tags/` and the profile's `tags/`, LoRAs and trigger words, wildcards, frequent tags from the profile database); Ctrl+↑/↓ changes weights.

**Folders:** a profile has ordered lists of models, output and wildcards folders (`profile.folders`, Settings → Folders, ADR-0017). The first of each is main: downloads, generated images and batch results go there; the others are read and edited in place, and a higher folder wins a name clash.

**Library:** the gallery indexes the output folders (its libraries) into the profile's `blombo.sqlite` (header-only reads, FTS5 trigram search, favorites and the trash list in their own tables). It takes PNG, JPEG, WebP and GIF images, MP4 videos and MP3, WAV, FLAC and OGG audio (`GALLERY_EXTENSIONS`; each row's `media`: image, animated, video, audio, and `duration`): `services/gallery/files.ts` reads them, `lib/mediameta.ts` an MP4's size, length and Video Helper Suite's comment and a FLAC's length and comments (ComfyUI's prompt and workflow), sharp a GIF's or animated WebP's frames. Thumbnails: an animation's first frame (and its moving one with `&anim=1`), a video's frame through `ffmpeg` when it's on the PATH (a plain card without it), a card for audio. Files are served with byte ranges, so players can seek. Tiles play animations on their own and videos (muted) only when Settings → Gallery says so (`autoplayAnimated` on, `autoplayVideo` off by default), or while pointed at; the lightbox plays the file. Ctrl/⌘ + click and Shift + click pick tiles (`features/gallery/selection.ts`) for a floating bar that moves them to the trash together. Thumbnails are WebP files in `runtime/cache/<profile>/thumbs/` behind immutable URLs. Finished jobs are indexed as their images land and pushed over the live bus (`gallery` topic). The gallery opens on Home (`services/gallery/home.ts`: random recent picks in a seeded order, and the models, LoRAs, wildcards and tags you use, from the job log and `tag_usage`, each with its newest images); the image list can also be shuffled (sort `random` with a seed). Lists, counts and the showcase leave out script grids (a `grids` or `*-grids` folder) and images from stopped runs (an `interrupted` folder, or the `interrupted` table for ones that couldn't be moved) while Settings → Gallery says so (`excludeGrids`, `excludeInterrupted`, both on by default). **Added images** (`services/gallery/imports.ts`): Add to gallery copies an image from your PC (File info's button, or dropped or pasted on the gallery) into the main output folder's `imported/`, or downloads a Civitai image's original (the model page's carousel and Gallery, File info's carousel, the viewer) into `civitai/` with a `<image>.civitai.json` sidecar (`CivitaiSidecar`: the poster's prompt and settings, who posted it, every model version that made it and each one's model name; Civitai's files often carry no metadata of their own, and only its answer names the versions). Images from Civitai's generator keep its ComfyUI graph as JSON in the EXIF comment, with models named by AIR (`urn:air:…:civitai:<model>@<version>`, `parseAir`) and its own record (`extraMetadata`) beside the nodes: the prompt texts come from that record, and the index names each AIR after the local model that is its version, else the sidecar's name, else "Civitai model <id>" (`nameAirs`). Adding a Civitai image again fills in the names of a sidecar saved without them. An image's origin (generated, imported, civitai) is read from its path; lists show any mix (`origins`). A Civitai image is in the model and LoRA filters only through local models that are its versions (`image_versions`), so a LoRA you don't have never shows there and one you download picks its images up. Models → Local scans the models folders by kind with sidecar info and each model's picture (`<model>_data/thumbs/global.*` for cards, saved as Settings → Models → Pictures says: 0.25 MP JPEG at 85 by default, a GIF or animated WebP kept moving as a WebP and served animated; the full size, `global_raw.png`, at `/api/models/picture/raw` for the model info dialog; `services/modelthumbs.ts`, ADR-0016). The model info dialog (any model's right-click → Model info…) saves trigger words, a LoRA's strength and its slider's range (`"strength range"`, 0–2 without one), whether it's instant and where its trigger words go (`"instant lora"`, `"trigger position"`), and notes into the model's A1111 `.json` (`PATCH /api/models/info`; your trigger words win over Civitai's, the strength is what a picked LoRA gets) and replaces the picture (`/api/models/picture`); right-click menus come from `openContextMenu` in `ui/floating.tsx`. Models → Wildcards (`features/wildcards/WildcardsTab.tsx`; the header has no Wildcards tab) shows the wildcards folders as cards (View: the pickers' `ModelGrid` with `browse`, favorites as model marks of kind `wildcards`, sorted by name, path, the defining file's dates or size (`WildcardList.stats`, `wildcardStats`) or entries) or in the Wildcard Manager (Editor), which edits the wildcards folders (each a top-level row). A wildcard's picture is one you set in its info dialog (a file or the latest result), kept in the profile's `wildcard-pictures/` (`services/wildcardpics.ts`, `WildcardList.pictures`), never in the wildcards folders. **Renames carry along:** every wildcard rename (the pickers' Rename…, a move in the Manager's tree, a YAML key renamed in the editor: the draft's `renames`, sent with the save) reaches `wildcardsRenamed` in `context.ts` as `RenameChange`s, which moves pictures and favorites; model renames and moves move favorites through `onRenamed`. **Settings → Leftovers** (`services/leftovers.ts`, `/api/leftovers`) finds what's kept for models and wildcards that are gone (a model's sidecars and `_data/` pictures with no model of that name in the folder, wildcard pictures, favorites) and moves the picked files to the profile's `trash/leftovers/` and forgets the favorites; a folder that isn't there is skipped, never judged. Settings live in `settings.json` (`shared/settings.ts`).

**Online:** the server talks to Civitai for the client (cached API answers and an image proxy in `runtime/cache/civitai/`; the profile's key in `secrets.json`, never sent to the page). The profile picks the site (`settings.civitai.site`: civitai.com, SFW only, or civitai.red, everything; `CIVITAI_SITE_URLS`): context.ts points the one `CivitaiApi` at it when the profile opens or the setting changes, so searches, downloads, the key's origin, the lookup and model links follow. `--civitai` fixes the address instead (the fake one). Civitai links follow the key (`civitaiInApp`): with a key Civitai accepted a model opens in Models → Civitai, else its page on the site (`civitaiPageUrl`; a new tab, or in the desktop window a question: your browser through `POST /api/civitai/open-page`, which opens only the profile's site, or a window here). The lightbox's model and LoRA names link to File info for a model in your folder, else to Civitai (the image's `summary.civitai` ids, or a search by name). Downloads are a server queue with resume, hash checks and smart folders, progress on the bus (`downloads` topic) and history in the profile database; local models without info files are matched on Civitai by hash in the background; Models → Manager installs from ComfyUI-Manager's catalog through the same queue (ADR-0012).

**Polish (Phase 5, ADR-0015):** every run that leaves the queue is logged in the profile database (`services/history.ts`: values, stages, timings, what it used), which feeds Settings → Overview (`/api/history/stats`), History → Generations (Run again: `queue.rerun`), prompt history, the pickers' recent models and the Errors view (errors are logged too). `services/timing.ts` turns ComfyUI's `executing` / `progress` into time and it/s per stage (`Job.timings`, `progress.rate`). Snippets are `snippets.json`. Gallery ratings, your tags and collections are marks keyed by library + path. A profile exports as a zip (`services/backup.ts`, without the trash and the Civitai key) and imports as a new profile. Client-side: the command palette (`app/Palette.tsx` on `ui/CommandPalette`), shortcuts (`shared/shortcuts.ts`, overrides in `settings.shortcuts`, `app/useShortcuts.ts`, actions in `app/commands.ts`; `tab.N` / `worktab.N` open the header's and Generate's tabs by place, as `settings.ui` arranges them: `arrangeTabs`, `tabForNumber`; Generate's tab lives in `features/generate/worktab.ts`), Settings → Interface (`settings.ui`: tab order and hiding, header labels, card sizes, where a profile opens: `app/startView.ts`), OS notifications (`lib/notifications.ts` → `notify()` in `lib/platform.ts`), Help (`features/help/`), the first-run tour (`ui/Tour` + `features/generate/GenerateTour.tsx`), PNG drop on Generate (`features/generate/ImageDrop.tsx`).

**Hardening (final pass):** `/api` answers only Blombo's own pages (`lib/guard.ts`: local Host, same-origin browser requests; `/api/bridge/*` keeps its own CORS). Uploads go through `readBody` with a limit (`readBodyToFile` streams a large one into runtime/). Profile export and import stream through fflate; the uv download is pinned and checked by SHA-256. Saved settings and stage settings are read value by value (`shared/salvage.ts`); settings updates per profile are queued (`updateWith` for read-modify-write) and never write over a damaged or newer file without keeping it. The client saves pending values before the server switches profiles (`session.onProfileSwitch`). A managed slot's library caches stay in `runtime/cache/comfy/` (`slotCacheEnv`). Details: `docs/architecture.md` → Hardening.

**Preview data:** only the Design Lab's sample prompt (`features/preview/mock.ts`) is still a sample. Never build new features on preview data.

**Portable, no installer:** BlomboUI runs from the cloned folder through the launchers. Everything it writes stays in `data/` and `runtime/`; nothing goes to AppData or the registry (the desktop window keeps its WebView2 profile and size in `runtime/app/`). Only ComfyUI slots, and the custom node packs stages and batch presets need inside them (plus blombo-bridge), can be installed by the app, into `runtime/comfyui/`. Batch results and Install bridge for your own ComfyUI write only where you pick.

## Golden rules

1. **ComfyUI is the engine.** Graphs stay real ComfyUI graphs. Bind and patch them; never build a parallel engine.
2. **One schema per shape.** Anything that crosses the wire or lands on disk is a Zod schema in `src/shared/`. Never declare the same shape twice. Settings get one Zod field with a default.
3. **Workflows and layouts are data.** A new workflow is a file, not code. A new parameter on the Generate screen is a binding + a layout block, not a new component.
4. **Tokens only.** Raw colors exist only in `styles/tokens.css`. Use `ui/` components; a new control or variant isn't done until it's in the Design Lab.
5. **User data is sacred.** Writes go through `lib/fsx.ts` (atomic, queued). Opening or viewing never modifies files. Profile folders, outputs, models and wildcards are the user's: delete means move to trash.
6. **Paths from requests go through `resolveInside()`** and requests are validated with `readJson(c, Schema)`. Throw `HttpError` with a message that says what to do.
7. **Push, don't poll.** Live state comes from the live bus once it exists. Don't add `setInterval` polling against the server.
8. **Fast by default.** Virtualize anything that can hold hundreds of items. Subscribe to the smallest store slice. Keep Generate and Gallery mounted (Shell keep-alive).
9. **Windows first.** Mind path separators, CRLF in `.bat`, and file locks (that's why writes retry).
10. **Keep it typed and tested.** `npm run check` must pass. Pure logic gets Vitest tests next to it.

## Code conventions

- TypeScript strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`: **no enums, no parameter properties, no namespaces** (Node runs the server with type stripping).
- **Server, shared, tools:** relative imports **with `.ts`**, no aliases. **Client:** aliases `@client/…` and `@shared/…`, extensionless.
- Biome: 2 spaces, double quotes, semicolons, 100 columns. `npm run format`.
- One module, one job. Comments explain *why*, at the top of modules and at non-obvious decisions.
- Server state: TanStack Query with keys in `lib/queries.ts`. UI state: small Zustand stores per feature (see `features/generate/state.ts`), never one giant store.
- Copy: sentence case, say what happens, errors say what to do next (see `docs/design-system.md` → Copy).

## Workflows

### Add a feature
1. **Shared first:** vocabulary in `constants.ts`, Zod schemas, API response types.
2. **Server:** service in `services/`, thin route in `routes/`, register in `app.ts`.
3. **Client:** API call in `lib/api.ts`, query or mutation in `lib/queries.ts`, UI in `features/<area>/` using `ui/` components. Handle loading, empty and error states.
4. **Verify:** tests for logic, `npm run check`, then click through it in `npm run dev` in Blombo and Light themes. Use a throwaway `--data`/`--runtime` folder and the fake ComfyUI, never real profiles, outputs or models.
5. **Docs:** `docs/design-system.md` for a new UI pattern, `docs/workflows.md` for workflow format changes, this file for new commands or architecture, an ADR for a big decision.

### Add or change a built-in workflow preset
1. Edit `presets/workflows/<id>/prompt.json` (a ComfyUI API graph; values in it are the defaults) and the name, family, description and `preset.version` in `workflow.json`.
2. Run `node tools/build-presets.ts` to regenerate bindings, values and `graph.json`. The preset test fails if you forget.
3. Bump `preset.version` when changing a shipped preset so profiles can be offered the update later.

### Add or change a stage package
1. Edit `presets/stages/<id>/prompt.json` (an API graph with `PORT:<PORT>` stubs, `OUT:<PORT>` republishers and `_meta.blombo` `when` / `else` / `inputsWhen`) and `stage.json` (stage, family, ports, packs, fields, defaults). Format: `docs/workflows.md` → Stages.
2. New settings fields go into the stage's schema in `shared/workflow/stages.ts` (with defaults) and its block in `features/generate/blocks/stages/`; values reach the graph through `instancesFor()` in `services/workflows/stages.ts`.
3. Add every class the graph uses to the fake ComfyUI's `fixtures/object_info.json`, and a compiled-graph case to `services/workflows/stages.test.ts`. The package test fails if a class is unknown.
4. A pack the graph needs goes in `packs` with its GitHub URL, the classes it provides and a pinned `ref` (a full commit hash, e.g. from `git ls-remote <url> HEAD`), so the stage notice can install it (ADR-0013). Use the same `ref` in every package that lists the pack.

### Add or change a batch preset
1. Write `presets/workflows/<id>/prompt.json` with a `LoadImage` (the input the runner feeds), the work, and a `PreviewImage` for images (or a node that shows text, for captions); title nodes `$Something` to expose their settings. In `workflow.json` set `kind: "batch"`, the family `Utility`, a description, `preset.version`, and the `packs` its custom nodes come from (GitHub URL, classes, pinned `ref`), as for stages.
2. Add every class to the fake ComfyUI's `fixtures/object_info.json` (text-showing nodes need `output_node: true` and a `STRING` output), run `node tools/build-presets.ts`, and keep `presets.test.ts` green.
3. Text a node shows comes back through `TEXT_OUTPUT_KEYS` in `services/workflows/nodes.ts`; add a key there only if a captioner uses a new one.

### Change blombo-bridge
Edit `src/comfy-bridge/web/` (plain ES modules; logic that can be tested goes in `blombo-core.js` and its `.d.ts`), then bump `BRIDGE_VERSION` in `shared/bridge.ts` so managed slots get the new copy on their next start and Settings → ComfyUI says an external install is out of date. Check it with the fake ComfyUI page (`--fake-comfy` slot, Edit in ComfyUI) and `services/bridge.test.ts`. The extension only uses ComfyUI's public `app` API (`registerExtension`, `loadGraphData`, `graphToPrompt`, `extensionManager.toast`, commands and `menuCommands`).

### Teach the analyzer a node
Detection is by input names first (`seed`, `steps`, `positive`, `ckpt_name`…). Only when that can't work, add the class to `services/workflows/nodes.ts`, add a fixture graph under `services/workflows/fixtures/` and a case to `analyze.test.ts`.

### Add a Generate parameter or control style
- A parameter comes from a workflow **binding** (role or `$`-titled node), never hand-placed JSX.
- A new control style: add it to `CONTROL_STYLES` in `shared/layout/schema.ts`, render it in `features/generate/blocks/ParamControl.tsx`, add an Inspector label and glyph in `Customize.tsx`, show it in the Lab.

### Add a setting
One Zod field with a default in `shared/settings.ts` (inside its section). Read it with `useSettings()`, change it with `useUpdateSettings()` (a partial patch, merged and validated on the server). A setting that changes the shape of `settings.json` needs a migration step in `migrateSettings` and a test.

### Touch user files (outputs, models, wildcards)
Reads only through the service that owns the folder. Moves and renames go through `movePath` in `lib/fsx.ts` (refuses to overwrite, retries Windows locks); removing means moving into `data/profiles/<id>/trash/`. Resolve every request path with `resolveInside()` and validate names in the service too, not only in the route.

### Touch Civitai or downloads
Everything goes through the server: `services/civitai/` (API client with cache, image proxy, normalize) and `services/downloads.ts` (queue). Never call Civitai from the client and never put a remote image URL in the page; use `proxiedImage()`. Fetch with `fetchFollow` from `lib/remote.ts` (pass `auth` so the key goes only to Civitai's origin, `allow` for the image hosts). Writes into the models folder go through `openPartFile` / `commitPart` / `writeFileIfAbsent`. Tests and dev checks use the fake Civitai (`setupOnline()` in `services/civitai/fixtures/setup.ts` runs the real wiring against it), never the real site or a real key.

### Add a shortcut or a palette entry
An app-wide action is one entry in `SHORTCUT_ACTIONS` (`shared/shortcuts.ts`: id, label, group, default keys or `""`, optional `view`) and one case in `runAction()` (`app/commands.ts`); Settings → Shortcuts, the palette's Actions and Help list it from there. Keys that only work inside one view go in `FIXED_SHORTCUTS` (listed, not rebindable). Other palette groups (workflows, models, settings pages, help topics) are built from their data in `app/Palette.tsx`. Show the current keys with `useShortcutLabel()`, never a hardcoded string.

### Try layout variants
To compare designs in the running app, render them behind `useVariant(key, label, options)` from `lib/variants.ts` (options a module constant; built apps get the first). In dev mode a floating "Layouts" panel in the bottom-left corner (`features/dev/VariantPanel.tsx`) switches every variant on screen, and remembers the pick in this browser. Once the owner picks one, delete the `useVariant` call and the other layouts.

### Add a UI control
Build it in `src/client/ui/`, export from `ui/index.ts`, add every state to `features/lab/DesignLab.tsx`, document it in `docs/design-system.md`.

## Don't

- Don't add a component library (shadcn, MUI, Mantine…), an icon font, or lucide. Draw icons in `icons/paths.ts`.
- Don't add a second settings store, a second database per profile, or a cloud service / telemetry.
- Don't hardcode node class types into the UI. Roles and bindings decide what appears.
- Don't commit anything in `data/` or `runtime/`.
- Don't hand-edit `.cursor/rules/*.mdc`; they're generated from `.claude/rules/`.
