# ADR-0006: Profiles as folders; JSON for state, SQLite for indexes

**Status:** Accepted (built in Phases 0–2; profile.json is versioned since the final pass)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

The user wants a profile screen at startup, a creation flow that sets up folders and key settings, avatars, and a smooth transition into the Generate screen. Switching profiles must not restart the app, and settings should stay readable and easy to back up.

## Decision

```text
data/profiles.json                    registry (order, lastOpened, openOnLaunch)
data/profiles/<id>/profile.json       identity + paths + comfy slot + accent
data/profiles/<id>/settings.json      Settings (Zod schema with defaults + version + migrations)
data/profiles/<id>/workflows/…        workflow packages (ADR-0003)
data/profiles/<id>/layouts/…          layout documents (ADR-0005)
data/profiles/<id>/blombo.sqlite      gallery index, jobs, history, errors, stats, hashes
runtime/cache/<id>/                   thumbnails, temp (safe to delete)
```

- **The registry is a small JSON file.** It needs no database.
- **Human-meaningful state lives in JSON**: settings, workflows and layouts. Writes are atomic (write to a temp file, then rename) and debounced. JSON diffs well, backs up easily and can be edited by hand in an emergency.
- **Rebuildable or high-volume data lives in one SQLite file per profile** (`node:sqlite`, WAL): the gallery index (FTS5 when available, else trigram), job log, download and browse history, errors, usage stats, model hashes.
- **Hot switch**: `POST /api/profiles/:id/open` closes the current DB and opens the next. It emits `profile` on the bus, and the client remounts under `/p/:id`. ComfyUI restarts only if the models folder changed.
- **Creation flow** (all except the name can be changed later):
  1. Name, avatar (upload or generated monogram), accent color
  2. Folders: models, outputs, wildcards, with an existence check and "create if missing"
  3. ComfyUI: managed slot (`latest` or pinned) or an existing install or URL
  4. Starter workflows (preset checklist), theme, optional Civitai API key
- **Secrets** (the Civitai key) are stored in their own file, `data/profiles/<id>/secrets.json`, and never sent back to the client: the API answers only whether a key is set and its last four characters. *(Changed in Phase 3 from a `secret:` marker inside `profile.json`: a separate file can't leak through anything that reads, copies or shares `profile.json`, and profile updates can't drop it.)*

## Consequences

- Backups: copying `data/profiles/<id>` captures a profile. Exporting a profile is a zip of that folder.
- Settings migration is explicit: `settings.json.version` plus ordered migration functions in `shared/settings/migrations.ts`.

## Action items

1. [ ] `shared/profile.ts`, `shared/settings/schema.ts` with defaults for every setting.
2. [ ] `server/services/profiles.ts` (registry, create, open, avatar, delete to trash).
