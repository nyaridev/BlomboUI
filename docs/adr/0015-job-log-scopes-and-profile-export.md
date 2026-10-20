# ADR-0015: The job log, scopes and profile export

**Status:** Accepted (built on `phase-5-polish`; checked against the fake ComfyUI only)
**Date:** 2026-10-20
**Deciders:** nyaridev

## Context

Phase 5 keeps a group of features that all need to remember things across sessions:

- **Settings → Overview** counts images generated (total, this week, per day), GPU time, and the most used models, LoRAs and wildcards. The gallery index can't answer that: images get deleted or moved, and it doesn't know how long a run took or which wildcards it expanded.
- **History → Generations** (re-run), **prompt history**, the pickers' **recent models**, the **performance readout** and the **Errors** view all need the same facts about past runs.
- **Scopes** keep a picture of each model per context (ADR-0014 left "picking other scopes" for this phase), with groups and prompt tags that pick a scope automatically.
- **Export / import a profile** moves all of this to another PC.

## Decision

**One job log in the profile database.** The queue's `finished` event now carries what the run ran with (`RunContext`: manifest, values, stages); `services/history.ts` writes a `job_log` row for every run that left the queue (not runs cancelled before they started): state, seed, size, image count, start/finish, duration, model, prompts, values and stages as JSON, per-stage timings, the error and its first image's ComfyUI ref, plus `job_log_uses` rows (model, each LoRA from `<lora:…>` tags, each wildcard) so "most used" is a `GROUP BY`. The newest 20 000 rows are kept. Errors the bus announces go to `error_log` (newest 500). Both are migration 4 of `blombo.sqlite`, next to new user marks: `marks.rating`, `image_tags`, `collections` + `collection_items` (keyed by library + path like favorites, carried through the trash in `trash.extra`) and `model_marks` (favorite models).

**Timings come from ComfyUI's socket.** `services/timing.ts` (`RunClock`, pure) turns `executing` and `progress` into time and steps per segment (the base pass, each stage) and "Other" (loading, decoding, saving). The running job's progress carries a live `rate`; finished jobs carry `timings`. The fake ComfyUI now sends `executing` per sampler node.

**Scopes are files, like the pictures.** `data/profiles/<id>/scopes/scopes.json` (`blombo.scopes/1`: scopes with name, group and tags, the active scope, auto on/off) sits next to the scope folders the thumbnails script already wrote. Folders without an entry still show as scopes, and `default` always exists. The client works out the *effective* scope once (the active one, or with auto on the scope whose tags best match the Generate prompt, `pickScope()` in `shared/scopes.ts`) and every card swaps in that scope's picture; the server keeps falling back to the default scope's picture for models without a preview. Models folders are never written.

**Snippets** are human-readable state, so they're a JSON file too: `data/profiles/<id>/snippets.json`.

**Profile export is a zip of the profile folder** (`services/backup.ts`, `blombo.profile-export/1`): everything except `trash/` and `secrets.json` (the Civitai key stays on this computer), with the database copied by `VACUUM INTO` so an open profile exports consistently. Import always creates a new profile (a free id; " (imported)" when the name is taken), checks every entry path, refuses zips without the manifest or bigger than 4 GB unpacked, and lists the profile only after its files are written.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Job log rows (chosen)** | Exact counts, durations and re-run data; survives deleted images; one query per stat | A new table to migrate; values duplicated per run (small JSON) |
| Derive stats from the gallery index | No new data | Wrong after deleting or moving images; no GPU time, no wildcards, no failed runs |
| A JSON log file per profile | Readable | Unbounded file, slow aggregates, rewritten on every run |
| Scopes in the database | One store | The pictures are files anyway; a JSON next to them is readable and travels with the folder |

## Consequences

- Stats start counting from this version: runs made before Phase 5 aren't in the log (the gallery's own counts still show everything indexed).
- Clearing History → Generations also resets Overview's counts and the prompt history (the dialog says so).
- "Pick from the prompt" follows the prompt loaded on the Generate screen in this window; before Generate has been opened, cards show the active scope.
- A profile export doesn't carry models, outputs or wildcards (they're the user's folders); after importing on another PC the folders are set in Settings → Folders.
