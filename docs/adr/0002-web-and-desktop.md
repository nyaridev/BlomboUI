# ADR-0002: One local server, two windows (web + Tauri)

**Status:** Proposed
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

The user wants `start-web.bat` (browser) and `start-app.bat` (desktop window). Running a dev server plus a separate API port in everyday use is fragile. One process should serve everything, and both windows should show the same UI.

## Decision

- One **Blombo server** on `127.0.0.1:4380` serves the built client and `/api`. In dev, the API runs on `:4381` and Vite with HMR on `:4382`.
- **`start-web.bat`** installs dependencies on first run, builds if the sources changed, starts the server and opens the browser.
- **`start-app.bat`** does the same, then opens a **Tauri 2** window on the server URL. Closing the window stops the server. The Tauri binary is built once with `cargo` and rebuilt when `src-tauri/` changes (`tools/ensure-app.ts`, same pattern as Game Forge).
- The Tauri window grants Tauri IPC to `http://127.0.0.1:*` through a capability, so the page can open extra windows (ComfyUI editor) and send native notifications. All of this sits behind `client/lib/platform.ts`, which falls back to `window.open` and the web Notifications API in the browser.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Tauri thin shell (chosen)** | Small binary, native window, same UI as web, the user knows it | Needs Rust once to build |
| Electron | No Rust | About 150 MB, a second Chromium, its own Node |
| Tauri with a bundled sidecar server | One-click exe | Node sidecar packaging on Windows, slower to iterate |
| PWA only | Zero build | No real window, no multi-window control |

## Consequences

- One code path. Every feature works in both modes, and platform hooks have a web fallback.
- Folder pickers run on the server (PowerShell `FolderBrowserDialog` on Windows), so they work the same in both modes.
- Revisit: shipping a signed installer later (Tauri bundle plus Node sidecar).

## Action items

1. [ ] `src-tauri/` with `main.rs` (`--url`, window-state plugin, multi-window capability).
2. [ ] `tools/ensure-build.ts`, `tools/ensure-app.ts`, launchers with Node version checks.
3. [ ] `client/lib/platform.ts` with `openWindow`, `notify`, `revealPath`.
