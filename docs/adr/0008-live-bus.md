# ADR-0008: One WebSocket live bus instead of polling

**Status:** Proposed
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

Polling health, GPU stats, job status and previews every 1–4 s from each component costs CPU and battery, shows stale state, and makes the header "pulse".

## Decision

- The server holds **one** ComfyUI WebSocket per slot and **one** broadcast bus (`server/services/live.ts`).
- Clients connect to `/api/live` and subscribe to topics. Messages are typed with Zod discriminated unions in `shared/live.ts`.
- Topics: `job.*` (queued, started, progress, stage, preview, image, done, error), `system` (VRAM, temperature, load, Comfy status; sampled at 1 Hz only while at least one client is visible), `downloads.*`, `gallery.insert`, `models.changed`, `errors.new`, `profile.switched`, `comfy.log`.
- Preview frames travel as binary messages (a 4-byte job index plus WebP bytes). The client decodes them with `createImageBitmap`.
- On the client, `lib/live.ts` reconnects with backoff, updates TanStack Query caches or Zustand slices, and exposes `useLive(topic)`.

## Consequences

- The header meters update smoothly, with no polling from the components.
- Multiple windows (web + app) stay in sync.
- Requires care: back-pressure on previews (drop frames when the socket buffer is above a threshold).
