# AGENTS.md: BlomboUI

BlomboUI is a local, profile-based studio for **ComfyUI**. ComfyUI generates; BlomboUI gives it profiles, importable workflows, a Generate screen you can customize, a gallery, model management (local, Civitai, ComfyUI Manager), wildcards and helpers. It runs in the browser (`start-web.bat`) or a desktop window (`start-app.bat`, Tauri).

This file is the source of truth for every coding agent (Claude Code, Cursor, Codex…). Area rules live in `.claude/rules/` and are mirrored to `.cursor/rules/`. Specs:

- `docs/architecture.md`: the map (start here)
- `docs/design-system.md`: tokens, type, motion, icons, components, copy
- `docs/workflows.md`: workflow packages, roles, import, stages, compile
- `docs/adr/`: decisions and why (0001–0011)
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
| `node src/server/services/comfy/fixtures/fake-comfy.ts --port 8297 --step-ms 120 [--output-directory DIR]` | A fake ComfyUI (no GPU): point a throwaway profile at it (external URL) to try Generate end to end. With an output directory it writes each image there (with metadata), so the gallery's live inserts work too |
| `node src/server/main.ts --dev --port 4391 --data <tmp> --runtime <tmp>` + `BLOMBO_API_PORT=4391 BLOMBO_WEB_PORT=4392 vite` | A second, throwaway dev instance (own profiles, slots and caches) next to one that's already running |

## Architecture map

```text
src/
├── shared/       Vocabulary + Zod schemas + pure logic used by both sides
│                 constants · profile · settings · api · comfy · jobs · live · random
│                 gallery · imageinfo · fileinfo · safetensors · models · wildcards · install
│                 layout/schema · workflow/{roles,manifest,graph} · prompt/{tokenize,loras,wildcards}
├── server/       Node 22+ running TypeScript directly (type stripping) + Hono
│   ├── main.ts       flags (--dev --port --open web|app|none --data --runtime), single instance
│   ├── context.ts    builds the services and wires their events together
│   ├── app.ts        /api routes + built client in production
│   ├── routes/       thin: validate (Zod) → service → JSON
│   │                 profiles · system · settings · comfy · workflows · jobs · wildcards
│   │                 gallery · models · fileinfo
│   ├── services/     profiles · settings · system · window · live (bus) · jobs (queue)
│   │                 wildcards · models · fileinfo
│   │   ├── comfy/        supervisor · client · stats · paths · slots · installer (uv, progress)
│   │   ├── gallery/      index (sync, search, favorites, trash, libraries) · meta
│   │   └── workflows/    store · analyze · convert · import · compile · presets · nodes · summary
│   │                 (planned: civitai · downloads · autocomplete)
│   ├── db/           profileDb (node:sqlite, migrations, FTS5 trigram)
│   └── lib/          fsx (atomic, queued writes; movePath; resolveInside) · http · send
│                     emitter · imagemeta (header-only PNG/WebP/JPEG) · exif · thumbs (sharp) · ansi
├── client/       React 19 · Vite 8 · Tailwind 4 · TanStack Router/Query · Zustand · Motion ·
│   │             Floating UI · dnd-kit · CodeMirror 6
│   ├── app/          router · Shell (keep-alive views) · header/ · theme
│   ├── features/     profiles · generate · gallery · fileinfo · models · wildcards · settings
│   │                 lab · common · preview
│   ├── ui/           the design system (hand-built controls). Import from "@client/ui"
│   ├── icons/        hand-drawn SVG icon set + Logo
│   ├── lib/          api · queries · session · live (bus client) · motion · platform · hooks
│   │                 number · seeded · cn
│   └── styles/       tokens.css (all raw colors) · index.css (Tailwind theme) · base.css
└── comfy-bridge/ (planned) ComfyUI extension: "Edit in ComfyUI" / "Save to Blombo"
src-tauri/        Desktop shell: native window on --url, capability for localhost IPC
presets/          workflows/ (sd15, sdxl, illustrious) · planned: stages/, layouts/
tools/            ensure-build · ensure-app · dev-window · sync-rules · make-icons · build-presets
data/             (gitignored) profiles.json + profiles/<id>/   ← user data, never commit
runtime/          (gitignored) ComfyUI slots, caches, logs
```

**Data flow:** client → `/api` (Zod-validated) → service → files in `data/` and ComfyUI's HTTP API. Live state comes back over one WebSocket per window, `/api/live` (ADR-0008): ComfyUI status, GPU stats at 1 Hz, queue snapshots, step progress, binary preview frames, errors, and ComfyUI's log while a log view is open. The server owns the single ComfyUI socket (`services/comfy/client.ts`) and fans it out (`services/live.ts`); the client keeps it in `lib/live.ts`.

**Generating:** the Generate button posts the current values to `/api/jobs`. The server queue (`services/jobs.ts`) compiles one run at a time (`workflows/compile.ts`: values → wildcards → LoRA tags → seed → filename prefix), sends it to ComfyUI and turns its socket events into progress, previews and images. The queue lives on the server, so reloads and other windows see the same thing.

**Library:** the gallery indexes the outputs folder and extra library folders into the profile's `blombo.sqlite` (header-only reads, FTS5 trigram search, favorites and the trash list in their own tables). Thumbnails are WebP files in `runtime/cache/<profile>/thumbs/` behind immutable URLs. Finished jobs are indexed as their images land and pushed over the live bus (`gallery` topic). Models → Local scans the models folder by kind with sidecar thumbnails and info; the Wildcard Manager edits the wildcards folder. Settings live in `settings.json` (`shared/settings.ts`).

**Preview data:** only the Design Lab's sample prompt (`features/preview/mock.ts`) and the Civitai and Manager tabs of Models are still samples. Never build new features on preview data; replace the imports as services land.

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

### Teach the analyzer a node
Detection is by input names first (`seed`, `steps`, `positive`, `ckpt_name`…). Only when that can't work, add the class to `services/workflows/nodes.ts`, add a fixture graph under `services/workflows/fixtures/` and a case to `analyze.test.ts`.

### Add a Generate parameter or control style
- A parameter comes from a workflow **binding** (role or `$`-titled node), never hand-placed JSX.
- A new control style: add it to `CONTROL_STYLES` in `shared/layout/schema.ts`, render it in `features/generate/blocks/ParamControl.tsx`, add an Inspector label and glyph in `Customize.tsx`, show it in the Lab.

### Add a setting
One Zod field with a default in `shared/settings.ts` (inside its section). Read it with `useSettings()`, change it with `useUpdateSettings()` (a partial patch, merged and validated on the server). A setting that changes the shape of `settings.json` needs a migration step in `migrateSettings` and a test.

### Touch user files (outputs, models, wildcards)
Reads only through the service that owns the folder. Moves and renames go through `movePath` in `lib/fsx.ts` (refuses to overwrite, retries Windows locks); removing means moving into `data/profiles/<id>/trash/`. Resolve every request path with `resolveInside()` and validate names in the service too, not only in the route.

### Add a UI control
Build it in `src/client/ui/`, export from `ui/index.ts`, add every state to `features/lab/DesignLab.tsx`, document it in `docs/design-system.md`.

## Don't

- Don't add a component library (shadcn, MUI, Mantine…), an icon font, or lucide. Draw icons in `icons/paths.ts`.
- Don't add a second settings store, a second database per profile, or a cloud service / telemetry.
- Don't hardcode node class types into the UI. Roles and bindings decide what appears.
- Don't commit anything in `data/` or `runtime/`.
- Don't hand-edit `.cursor/rules/*.mdc`; they're generated from `.claude/rules/`.
