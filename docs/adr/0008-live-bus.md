# ADR-0008: One WebSocket live bus instead of polling

**Status:** Accepted (built in Phase 1)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

Polling health, GPU stats, job status and previews every 1–4 s from each component costs CPU and battery, shows stale state, and makes the header "pulse".

## Decision

- The server holds **one** ComfyUI WebSocket per slot and **one** broadcast bus (`server/services/live.ts`).
- Clients connect to `/api/live` and subscribe to topics. Messages are typed with Zod discriminated unions in `shared/live.ts`.
- Topics a window subscribes to: `comfy` (`comfy.status`), `system` (GPU stats, sampled at 1 Hz only while at least one window is visible), `jobs` (`queue` snapshots on every change, `job.progress` per step, `job.image`, preview frames) and `logs` (`comfy.log`, only while a log view is open). `hello`, `error` and `profile.switched` go to every window. Downloads, gallery inserts and model rescans join as their services land.
- A queue snapshot on every structural change (queued, started, finished, cancelled) replaces separate queued/started/done events: it is small, and a window that missed a message can't drift.
- Preview frames travel as binary messages: a 4-byte job sequence number, 1 byte for the image type, then the image bytes. ComfyUI's previews are already JPEG or PNG, so they pass through unchanged instead of being re-encoded to WebP. The client decodes them with `createImageBitmap`.
- On the client, `lib/live.ts` reconnects with backoff, keeps a `useLive` Zustand store (components select single values), invalidates TanStack Query caches when ComfyUI reconnects or the profile switches, and `followTopic()` subscribes extra topics while a view is mounted.
- Only pages served from this machine may connect (the Origin header is checked), so another website can't open the bus.

## Consequences

- The header meters update smoothly, with no polling from the components.
- Multiple windows (web + app) stay in sync.
- Requires care: back-pressure on previews (drop frames when the socket buffer is above a threshold).
