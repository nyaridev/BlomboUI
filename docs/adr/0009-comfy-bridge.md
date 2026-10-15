# ADR-0009: blombo-bridge — a ComfyUI extension for round-trip editing

**Status:** Proposed
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
