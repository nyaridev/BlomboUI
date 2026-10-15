---
description: Tauri desktop shell, launchers and build tools
paths:
  - "src-tauri/**"
  - "tools/**"
  - "*.bat"
---

# Desktop and launchers

- The Tauri app is a **thin shell** (ADR-0002): `blombo-ui.exe --url http://127.0.0.1:4380`. The server starts first (`--open app`) and spawns it; closing the main window stops the server. Keep all product logic in the web app.
- IPC is granted to localhost pages by `src-tauri/capabilities/localhost.json`. Extra windows use labels starting with `w` (see `lib/platform.ts`). Add a permission there only with a matching use in `platform.ts`.
- `tools/ensure-build.ts` and `tools/ensure-app.ts` rebuild only when sources are newer than the output. Add new source folders to their lists.
- `.bat` files are **CRLF** (`.gitattributes` enforces it). Every launcher checks Node ≥ 22.18, installs dependencies on first run, and pauses with a clear message on failure.
- Icons are generated: edit `src-tauri/app-icon.svg`, run `node tools/make-icons.ts`.
- Ports: server 4380, dev API 4381, dev web 4382 (`PORTS` in `src/shared/constants.ts`). Change them there only.
