# ADR-0009: blombo-bridge — a ComfyUI extension for round-trip editing

**Status:** Accepted (built on `phase-4b-roundtrip`; checked against the fake ComfyUI page, not a real ComfyUI frontend yet)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

The user wants an "Open in ComfyUI" button that opens ComfyUI in a new window to edit the current workflow. An extension bundled with every managed ComfyUI should add a **Save to Blombo** button that overwrites the workflow in Blombo, so workflows can be edited in place.

## Decision

- `src/comfy-bridge/` is a minimal ComfyUI custom node package: `__init__.py` with `WEB_DIRECTORY = "./web"` and no Python nodes, plus `web/blombo.js`.
- The ComfyUI supervisor copies it into `custom_nodes/blombo-bridge/` of every managed slot and updates it when its version changes. For an external ComfyUI, Settings → ComfyUI offers "Install bridge".
- **Edit session flow:**
  1. Blombo: `POST /api/workflows/:id/edit-session` returns `{ token }` (single use, 2 h TTL).
  2. Blombo opens `http://comfy/?blombo=<token>&blombo_api=<origin>` in a new window (Tauri window or browser tab).
  3. The extension reads the params, fetches the UI graph with `GET /api/bridge/:token` and calls `app.loadGraphData(graph)`. It shows a slim top banner: "Editing **<name>** from Blombo · Save to Blombo · Save as copy · Cancel".
  4. **Save to Blombo** calls `app.graphToPrompt()` and sends `POST /api/bridge/:token { workflow, output }`. Blombo runs re-sync (ADR-0003), and the edit window shows a toast with the result, such as "2 new parameters, 1 removed".
  5. **Save as copy** creates a new package and returns its id. Blombo can switch to it.
- Without a token, the extension adds **Send to Blombo** to the menu, which imports the current canvas as a new workflow.
- CORS on `/api/bridge/*` allows only the configured ComfyUI origin. Tokens are random 128-bit values.

## Consequences

- Round-trip editing without file juggling. Even complex graphs (subgraphs, primitives, reroutes) produce a correct API graph, because ComfyUI's frontend converts them itself.
- The extension uses ComfyUI's frontend APIs (`app.loadGraphData`, `app.graphToPrompt`, the menu and command API), so it needs a smoke test per pinned ComfyUI slot.

## Implementation notes (Phase 4b)

- **Files.** `src/comfy-bridge/`: `__init__.py` (no nodes, `WEB_DIRECTORY`), `web/blombo.js` (the extension: `app.registerExtension` with a `Blombo.SendToBlombo` command in the Workflow menu, `setup()` opens a session, `app.loadGraphData` / `app.graphToPrompt`, toasts through `app.extensionManager.toast`) and `web/blombo-core.js` (address parsing and the `/api/bridge` client, no dependencies, tested by Blombo's Vitest through `blombo-core.d.ts`). Installing writes `web/bridge.json` (`BRIDGE_VERSION`, which Blombo reads back through ComfyUI's `/extensions/blombo-bridge/bridge.json` to tell loaded, out of date or missing) and `web/config.json` (Blombo's address for Send to Blombo).
- **Managed slots** get the bridge from the supervisor's `prepareSlot` hook before every start (`services/comfy/bridge.ts`, copied only when the version or address changed). **Your own ComfyUI:** Settings → ComfyUI → Install bridge copies it into the folder you pick (ComfyUI's folder, `custom_nodes`, or a portable build's folder).
- **Sessions** (`services/bridge.ts`): `POST /api/workflows/:id/edit-session` refuses while ComfyUI is down or the bridge isn't loaded (the error points at Settings → ComfyUI). Tokens are 128-bit, bound to the workflow and the open profile, expire after 2 h, and each save uses one up and returns the next, so the same window can save again (after **Save as copy**, the next save goes to the copy). Reading the session doesn't use the token, so reloading ComfyUI's page works; the extension removes the token from the address once it's loaded.
- **The canvas shows the workflow's current values** (`applyWidgetValues` in `workflows/convert.ts` writes them into the UI graph's widgets). On save, re-sync (`workflows/resync.ts`) keeps Blombo's value for every matched parameter unless it was changed in ComfyUI (the input came back with something other than what the canvas was opened with); then ComfyUI's value wins and the report lists it ("1 changed in ComfyUI"). The previous package is copied to the profile's trash before an overwrite.
- **CORS:** `/api/bridge/*` answers only the open profile's ComfyUI origin (127.0.0.1 and localhost count as the same), including on errors so the extension can show Blombo's message; any other browser origin gets 403. Blombo's own page uses `/api/comfy/bridge` (status, install).
- **Blombo's side:** saves arrive as `workflow.saved` on the live bus; every window refetches, the open workflow reloads its values, and a toast says what changed (copies and Send to Blombo get an **Open** action).
- **Checking without ComfyUI:** the fake ComfyUI serves custom nodes' web folders and a stand-in page (`fixtures/fake-comfy-page/`) with the parts of `app` the bridge uses, so the whole round trip runs in the browser. A smoke test against each pinned real ComfyUI frontend is still to do.

