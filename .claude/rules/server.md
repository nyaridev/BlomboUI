---
description: Server rules (Hono routes, services, files, ComfyUI, live bus)
paths:
  - "src/server/**/*.ts"
---

# Server rules

- Node runs `.ts` directly (type stripping): relative imports **with `.ts`**, no enums, no parameter properties, no namespaces, no path aliases.
- **Routes are thin:** `readJson(c, Schema)` → service → `c.json(...)`. Schemas come from `src/shared/`. Throw `HttpError(status, message, code)`; the message tells the user what to do. `app.onError` formats it.
- **Services own one concern** (`profiles`, `system`, and soon `comfy`, `workflows`, `jobs`, `gallery`, `models`, `civitai`, `downloads`, `wildcards`, `autocomplete`, `live`). They receive `ServerConfig`; they never read `process.cwd()`.
- **Files:** write app state with `writeJsonAtomic` / `writeFileAtomic` from `lib/fsx.ts`. They queue writes per file and retry Windows lock errors, so concurrent requests never corrupt JSON. Resolve request paths with `resolveInside(root, rel)`.
- **User folders** (models, outputs, wildcards) are read-mostly. Never delete from them; move to the profile's trash and say so.
- **Profiles** are folders under `data/profiles/<id>/` (ADR-0006). The active profile is in memory; switching is a hot swap. Only restart ComfyUI when the models folder changes.
- **ComfyUI:** one WebSocket per slot owned by the server; fan events out over the live bus (ADR-0008). Never block the event loop with synchronous network or disk work; stream large files.
- **Long work** (hashing, gallery sync, downloads, thumbnails) runs as background tasks that report progress on the live bus and can be cancelled.
- **Tests:** Vitest next to the code (`*.test.ts`). Use temp folders (`fs.mkdtemp`) for anything that writes. Never touch `data/` in tests.
