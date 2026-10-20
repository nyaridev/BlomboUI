# AGENTS.md: BlomboUI

BlomboUI is a local, profile-based studio for **ComfyUI**. ComfyUI generates; BlomboUI gives it profiles, importable workflows, a Generate screen you can customize, a gallery, model management (local, Civitai, ComfyUI Manager), wildcards and helpers. It runs in the browser (`start-web.bat`) or a desktop window (`start-app.bat`, Tauri).

This file is the source of truth for every coding agent (Claude Code, Cursor, Codex…). Area rules live in `.claude/rules/` and are mirrored to `.cursor/rules/`. Specs:

- `docs/architecture.md`: the map (start here)
- `docs/design-system.md`: tokens, type, motion, icons, components, copy
- `docs/workflows.md`: workflow packages, roles, import, stages, compile
- `docs/adr/`: decisions and why (0001–0014)
- `docs/review/features.html`: the feature inventory with the owner's keep / later / drop decisions

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
| `node src/server/services/comfy/fixtures/fake-comfy.ts --port 8297 --step-ms 120 [--output-directory DIR]` | A fake ComfyUI (no GPU): point a throwaway profile at it (external URL) to try Generate end to end. With an output directory it writes each image there (with metadata), so the gallery's live inserts work too. Its `/object_info` includes the Impact Pack, Impact Subpack and controlnet_aux nodes the stages use and the batch presets' nodes (with `--custom-nodes DIR`, only the packs whose folder is in DIR); it takes `/upload/image`, reports progress per sampler node (so stage segments show), keeps Preview Image results as temp images, returns tags for tagger nodes, and `/view` serves the images it wrote. With `--custom-nodes`, `/` is a stand-in ComfyUI page that loads custom nodes' web extensions (blombo-bridge) |
| `node src/server/main.ts --dev … --fake-comfy` | Dev checks only: managed slots run the fake ComfyUI (with `--custom-nodes` on the slot's `custom_nodes/`), and custom node installs use fake downloads and a fake uv (`services/comfy/fixtures/fake-install-ops.ts`). Make a slot by hand in the throwaway runtime (`comfyui/<slot>/ComfyUI/main.py` and `.venv/Scripts/python.exe`, both empty) to click through **Install** on a stage or batch notice. The slot gets blombo-bridge on start, so **Edit in ComfyUI** opens the fake ComfyUI page with the bridge's bar (Save to Blombo, Save as copy, Send to Blombo) |
| `node src/server/main.ts --dev --port 4391 --data <tmp> --runtime <tmp>` + `BLOMBO_API_PORT=4391 BLOMBO_WEB_PORT=4392 vite` | A second, throwaway dev instance (own profiles, slots and caches) next to one that's already running |
| `node src/server/services/civitai/fixtures/fake-civitai.ts --port 8298 [--slow <bytes/s>] [--file-kb N]` | A fake Civitai and model catalog (API, images, ranged downloads, an early-access file). Start the server with `--civitai http://127.0.0.1:8298 --catalog http://127.0.0.1:8298/catalog/model-list.json` to browse and download without the real site; its API key is `FAKE_KEY` in that file |

## Architecture map

```text
src/
├── shared/       Vocabulary + Zod schemas + pure logic used by both sides
│                 constants · profile · settings · api · comfy · jobs · live · random
│                 gallery · imageinfo · fileinfo · safetensors · models · wildcards · install
│                 civitai · richtext (HTML → safe blocks) · downloads (destinations) · manager
│                 autocomplete (tag CSV, prompt context, formatting) · bridge (edit sessions)
│                 scripts (matrix / XY / thumbnails planner) · batch (runner shapes)
│                 layout/schema · workflow/{roles,manifest,graph,stages,packs}
│                 prompt/{tokenize,loras,wildcards,weight}
├── server/       Node 22+ running TypeScript directly (type stripping) + Hono
│   ├── main.ts       flags (--dev --port --open web|app|none --data --runtime --civitai --catalog)
│   ├── context.ts    builds the services and wires their events together
│   ├── app.ts        /api routes + built client in production
│   ├── routes/       thin: validate (Zod) → service → JSON
│   │                 profiles · system · settings · comfy · workflows · jobs · wildcards
│   │                 gallery · models · fileinfo · civitai · downloads · manager
│   │                 stages · layouts · autocomplete · bridge (/api/bridge, CORS) · scripts · batch
│   ├── services/     profiles · settings · system · window · live (bus) · jobs (queue)
│   │                 wildcards · models · fileinfo · downloads (queue) · lookup (hash → Civitai)
│   │                 manager (ComfyUI model catalog) · stages (packages, control images,
│   │                 checks, map preview) · layouts (profile layouts/) · autocomplete (tag lists,
│   │                 LoRAs, wildcards, frequent tags) · bridge (edit sessions, Save to Blombo)
│   │                 scripts (groups → grids, scope thumbnails) · batch (the batch runner) · scopes
│   │   ├── comfy/        supervisor · client · stats · paths · slots · installer (slots, progress)
│   │   │                 nodepacks (stage custom nodes into a slot) · uv (shared by both installers)
│   │   │                 bridge (copy blombo-bridge into custom_nodes) · fixtures/fake-comfy(-page)
│   │   ├── civitai/      api (cached client) · images (proxy) · normalize · fixtures/fake-civitai
│   │   ├── gallery/      index (sync, search, favorites, trash, libraries) · meta
│   │   └── workflows/    store · analyze (roles, ports) · convert · import · compile · loras
│   │                     stages (the splicer) · presets · nodes · summary · resync · bundle (.blombo)
│   ├── db/           profileDb (node:sqlite, migrations, FTS5 trigram) · ProfileDbs (shared connections)
│   └── lib/          fsx (atomic, queued writes; movePath; resolveInside; part files) · http · send
│                     remote (redirects by hand, key only to its origin, image sniffing)
│                     emitter · imagemeta (header-only PNG/WebP/JPEG) · exif · thumbs (sharp) · ansi
│                     grid (labeled script grids, sharp)
├── client/       React 19 · Vite 8 · Tailwind 4 · TanStack Router/Query · Zustand · Motion ·
│   │             Floating UI · dnd-kit · CodeMirror 6
│   ├── app/          router · Shell (keep-alive views) · header/ · theme
│   ├── features/     profiles · generate · gallery · fileinfo · models (local, civitai/, Manager)
│   │                 wildcards · settings · downloads · history · lab · common · preview
│   ├── ui/           the design system (hand-built controls). Import from "@client/ui"
│   ├── icons/        hand-drawn SVG icon set + Logo
│   ├── lib/          api · queries · session · live (bus client) · motion · platform · hooks
│   │                 number · seeded · cn
│   └── styles/       tokens.css (all raw colors) · index.css (Tailwind theme) · base.css
└── comfy-bridge/ blombo-bridge, the ComfyUI extension (ADR-0009): __init__.py + web/blombo.js +
                  web/blombo-core.js (plain JS; tests import the core through its .d.ts)
src-tauri/        Desktop shell: native window on --url, capability for localhost IPC
presets/          workflows/ (sd15, sdxl, illustrious; batch: remove-background, upscale, caption,
                  dataset-prep) · stages/ (hires, adetailer, controlnet ×
                  checkpoint/diffusion) · layouts/ (default, compact) · tags/ (starter list)
tools/            ensure-build · ensure-app · dev-window · sync-rules · make-icons · build-presets
data/             (gitignored) profiles.json + profiles/<id>/   ← user data, never commit
runtime/          (gitignored) ComfyUI slots, tools, caches, logs, app/ (desktop window data)
```

**Data flow:** client → `/api` (Zod-validated) → service → files in `data/` and ComfyUI's HTTP API. Live state comes back over one WebSocket per window, `/api/live` (ADR-0008): ComfyUI status, GPU stats at 1 Hz, queue snapshots, step progress, binary preview frames, errors, and ComfyUI's log while a log view is open. The server owns the single ComfyUI socket (`services/comfy/client.ts`) and fans it out (`services/live.ts`); the client keeps it in `lib/live.ts`.

**Generating:** the Generate button posts the current values and stage settings to `/api/jobs`. The server queue (`services/jobs.ts`) compiles one run at a time (`workflows/compile.ts`: values → wildcards → LoRA tags → stages spliced at the ports → seed → filename prefix), uploads ControlNet images, sends it to ComfyUI and turns its socket events into progress (split into segments: base passes, then each stage), previews and images. The queue lives on the server, so reloads and other windows see the same thing. Stage blocks ask `/api/stages/check` what's missing before you run. With a **script** on (Scripts block: prompt matrix, XY plot, scope thumbnails; `shared/scripts.ts`), the same button queues a **group** of runs with one seed; `services/scripts.ts` puts a matrix or plot into a labeled grid (`lib/grid.ts`) or files scope thumbnails. `kind: "batch"` workflows show the **batch runner** instead (`services/batch.ts`): one queued run per input file, results and sidecar captions written to the output folder (ADR-0014).

**Round trips with ComfyUI:** Edit in ComfyUI asks `/api/workflows/:id/edit-session` for a single-use token and opens ComfyUI with it; the blombo-bridge extension (`src/comfy-bridge/`, copied into managed slots before they start) loads the canvas and calls `/api/bridge/*` (CORS for that ComfyUI only) to save back; `services/workflows/resync.ts` carries values over and reports what changed, and `workflow.saved` on the live bus updates every window (ADR-0009). Export / import of `.blombo` bundles: `services/workflows/bundle.ts`.

**Generate screen:** the params column is a layout document; built-in layouts are in `presets/layouts/`, the profile's in `layouts/`, and a workflow links one (`manifest.layout`; `GET /api/workflows/:id` returns the layout it shows). The prompt editor's autocomplete asks `/api/autocomplete` (tag lists in `presets/tags/` and the profile's `tags/`, LoRAs and trigger words, wildcards, frequent tags from the profile database); Ctrl+↑/↓ changes weights.

**Library:** the gallery indexes the outputs folder and extra library folders into the profile's `blombo.sqlite` (header-only reads, FTS5 trigram search, favorites and the trash list in their own tables). Thumbnails are WebP files in `runtime/cache/<profile>/thumbs/` behind immutable URLs. Finished jobs are indexed as their images land and pushed over the live bus (`gallery` topic). Models → Local scans the models folder by kind with sidecar thumbnails and info; the Wildcard Manager edits the wildcards folder. Settings live in `settings.json` (`shared/settings.ts`).

**Online:** the server talks to Civitai for the client (cached API answers and an image proxy in `runtime/cache/civitai/`; the profile's key in `secrets.json`, never sent to the page). Downloads are a server queue with resume, hash checks and smart folders, progress on the bus (`downloads` topic) and history in the profile database; local models without info files are matched on Civitai by hash in the background; Models → Manager installs from ComfyUI-Manager's catalog through the same queue (ADR-0012).

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

### Add a UI control
Build it in `src/client/ui/`, export from `ui/index.ts`, add every state to `features/lab/DesignLab.tsx`, document it in `docs/design-system.md`.

## Don't

- Don't add a component library (shadcn, MUI, Mantine…), an icon font, or lucide. Draw icons in `icons/paths.ts`.
- Don't add a second settings store, a second database per profile, or a cloud service / telemetry.
- Don't hardcode node class types into the UI. Roles and bindings decide what appears.
- Don't commit anything in `data/` or `runtime/`.
- Don't hand-edit `.cursor/rules/*.mdc`; they're generated from `.claude/rules/`.
