# ADR-0011: The gallery index, thumbnails and user marks

**Status:** Accepted (built in Phase 2)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

The gallery has to show tens of thousands of images from the outputs folder and extra folders, search their prompts, filter by model and LoRA, keep favorites, and let images be removed and restored, without ever changing the user's files on view and without slowing the app on open. ADR-0006 put rebuildable indexes in one SQLite file per profile and human state in JSON.

## Decision

- **Index:** `images` rows in the profile's `blombo.sqlite` (node:sqlite), one per file, keyed by library + relative path, with size, mtime, pixel size, the parsed summary and the "use these settings" data as JSON, plus `image_loras` for LoRA filters. A sync re-reads only files whose size or mtime changed, reading headers only (PNG chunks, WebP and JPEG EXIF), never pixels.
- **Search:** an FTS5 table with the trigram tokenizer over the same text (file name, prompts, model, LoRAs, workflow, seed), so any substring of 3+ characters matches; shorter terms and SQLites without FTS5 use `LIKE`.
- **User marks survive a rebuild:** favorites (`marks`) and the trash list (`trash`) are separate tables keyed by library + path, not columns on rebuildable rows. Library folders are settings (JSON), not database rows.
- **Trash moves files** into `data/profiles/<id>/trash/gallery/<id>/`; restore moves them back. Emptying the trash deletes only from that folder, after a confirmation.
- **Thumbnails:** WebP (max 640 px) made with sharp on first request, cached in `runtime/cache/<profile>/thumbs/`, named by a hash of path + size + mtime; URLs carry the version so they're `immutable`. sharp's cache is off so libvips never keeps a user file open (Windows locks).
- **Live:** the queue's `job.image` events are indexed as they land and pushed as `gallery.added`; other changes push `gallery.changed`.
- **Client:** pages of 300 newest-first (TanStack infinite query), laid out into justified rows of exact height and rendered with TanStack Virtual.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **SQLite index + FTS5 trigram (chosen)** | Fast substring search, one file, rebuildable | FTS5 availability depends on the SQLite build (fallback in place) |
| Scan the folder on every open | No index to keep | Seconds to minutes for big folders; no search |
| A JSON sidecar per image | Travels with the file | Writes into user folders; slow to query |
| Favorites as a column on `images` | Simpler queries | Lost when the index is rebuilt |

## Consequences

- Opening a profile starts a background sync; an unchanged folder costs one `stat` per file.
- Moving files outside Blombo shows up as remove + add at the next sync (favorites follow the path, so a moved favorite loses its heart). "Relink and sync" is a later feature.
- Deleting `blombo.sqlite` rebuilds the index but loses favorites and the trash list; the trashed files stay in the trash folder.
