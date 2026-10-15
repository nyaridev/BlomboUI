# ADR-0001: TypeScript end to end (Node + Hono server, React client)

**Status:** Proposed
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

BlomboUI has three moving parts: the UI, an app server, and ComfyUI, which brings its own Python and Torch. A Python app server would need a second Python environment beside ComfyUI's, and every shape that crosses the wire would be written twice:

- Settings are the worst case: dozens of keys, each needing a default, validation and cleaning in both languages, kept in sync by hand.
- Request and response types would be mirrored by hand, or generated and still checked by hand.
- Installing would need Node *and* an app venv, plus ComfyUI's Python.
- A synchronous Python server pushes live progress toward polling.

The app's own work is I/O and light image work: files, SQLite, HTTP to ComfyUI and Civitai, PNG chunks, safetensors headers, thumbnails, and grid composites. Heavy ML stays inside ComfyUI.

## Decision

Write the app server in **TypeScript on Node 22+**. It runs `.ts` directly through Node's type stripping, with **Hono** for HTTP, **ws** for WebSocket, **node:sqlite** for storage and **sharp** for images. All shapes live once in `src/shared/` as **Zod** schemas that both sides import. Python stays only where it belongs: inside each ComfyUI slot.

## Options considered

### Option A: FastAPI, with TS types generated from OpenAPI
| Dimension | Assessment |
|---|---|
| Complexity | Medium. A codegen step, and still two runtimes |
| Cost | Medium: two runtimes to maintain |
| Performance | Fine, but sync style pushes us toward polling |
| Familiarity | High |

**Pros:** Python ecosystem; PIL is familiar.
**Cons:** two languages forever; codegen covers only types, so cleaning and migration logic is still duplicated; the extra venv makes installs slower.

### Option B: Node + Hono + Zod, shared schemas (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Low at runtime, one language |
| Cost | Everything written in one language |
| Performance | Async I/O by default; sharp (libvips) is faster than PIL for thumbnails |
| Familiarity | High (same stack as Game Forge) |

**Pros:** one schema per shape; one install (Node); the same tooling for client and server (Biome, Vitest, tsc); easy WebSocket push.
**Cons:** native `sharp` binary (prebuilt for Windows x64); `node:sqlite` is newer than better-sqlite3.

### Option C: Bun
**Pros:** built-in SQLite, fast startup. **Cons:** Windows edge cases, and it is a different runtime from the user's other projects.

## Trade-off analysis

The real cost of a two-language app is duplication, not speed. Option A keeps the duplication. Option B removes it. Most of the logic is pure (parsers, wildcard grammar, compose rules) and easy to cover with Vitest.

## Consequences

- Easier: adding a setting means one Zod field with a default, and the validation and UI types follow from it.
- Easier: live progress, because the async server relays ComfyUI's WebSocket.
- Harder: anything needing a Python library must run as a ComfyUI node or workflow. Captioning, background removal and upscaling already work that way.
- Revisit: `node:sqlite` FTS5 availability. The fallback is trigram tables or `LIKE`. See ADR-0006.

## Action items

1. [ ] Scaffold `src/shared`, `src/server`, `src/client` with one `tsconfig` and Biome.
2. [ ] Write pure logic first, with tests: PNG info, safetensors header, wildcard expansion, prompt syntax, Civitai sort rules.
3. [ ] Verify `node:sqlite` FTS5 on the target Node version. Pin `engines.node`.
