---
description: Server rules (Hono routes, services, files, ComfyUI, live bus)
paths:
  - "src/server/**/*.ts"
---

# Server rules

- Node runs `.ts` directly (type stripping): relative imports **with `.ts`**, no enums, no parameter properties, no namespaces, no path aliases.
- **Routes are thin:** `readJson(c, Schema)` → service → `c.json(...)`. Schemas come from `src/shared/`. Throw `HttpError(status, message, code)`; the message tells the user what to do. `app.onError` formats it.
- **Services own one concern** (`profiles`, `system`, `comfy/`, `workflows/`, `jobs`, `live`, `wildcards`, and soon `gallery`, `models`, `civitai`, `downloads`, `autocomplete`). They receive what they need (config, other services) through `context.ts`; they never read `process.cwd()`. Cross-service reactions (profile opened → ComfyUI follows, ComfyUI events → queue and bus) are wired in `context.ts` with the small typed `Emitter` from `lib/emitter.ts`.
- **Files:** write app state with `writeJsonAtomic` / `writeFileAtomic` from `lib/fsx.ts`. They queue writes per file and retry Windows lock errors, so concurrent requests never corrupt JSON. Resolve request paths with `resolveInside(root, rel)`.
- **User folders** (models, outputs, wildcards) are read-mostly. Never delete from them; move to the profile's trash and say so.
- **Profiles** are folders under `data/profiles/<id>/` (ADR-0006). The active profile is in memory; switching is a hot swap. Only restart ComfyUI when the models folder changes.
- **ComfyUI:** the supervisor (`services/comfy/supervisor.ts`) owns the one ComfyClient (HTTP + WebSocket) for the active target; everything else goes through `supervisor.api` (null while ComfyUI is down) and its events. Fan events out over the live bus (ADR-0008). Never block the event loop with synchronous network or disk work; stream large files (`/api/comfy/view` pipes ComfyUI's response).
- **Workflows:** node class names live only in `services/workflows/nodes.ts`; the analyzer, converter and compiler read from there. Keep `compile.ts` pure (inputs in, graph out) so it stays testable.
- **Long work** (hashing, gallery sync, downloads, thumbnails) runs as background tasks that report progress on the live bus and can be cancelled.
- **Tests:** Vitest next to the code (`*.test.ts`). Use temp folders (`fs.mkdtemp`) for anything that writes. Never touch `data/` in tests. For anything that talks to ComfyUI use the fake in `services/comfy/fixtures/fake-comfy.ts` (in-process with `startFakeComfy()`, or as a stand-in `main.py` for supervisor tests).
