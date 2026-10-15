# ADR-0012: Civitai through a caching server proxy, and a server-side download queue

**Status:** Accepted (built in Phase 3)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

Phase 3 brings Civitai and the ComfyUI model catalog into the app: browsing, model pages, downloads into the profile's models folder, matching local files on Civitai, and a store for ComfyUI's own models. Constraints:

- The profile's Civitai API key must never reach the page in full, and must never be sent anywhere but Civitai.
- Browsing should feel instant when going back and forth, and many thumbnails load at once.
- Model files are large (hundreds of MB to 20+ GB): downloads must survive a dropped connection, a page reload and an app restart, never overwrite a user's file, and never leave half a model where ComfyUI would load it.
- BlomboUI is portable: everything it writes stays in `data/` and `runtime/`, except the models it was asked to put in the models folder.
- Push, don't poll (ADR-0008).

## Decision

**The client never talks to Civitai.** `services/civitai/` does:

- `api.ts` calls Civitai's REST API v1 with the profile's key (from `data/profiles/<id>/secrets.json`) and caches answers in memory and in `runtime/cache/civitai/api/` (search pages 10 min, models 30 min). The cache key includes a hash of the key that asked, so one profile's results never show for another.
- `normalize.ts` turns answers into the shapes in `shared/civitai.ts`. Descriptions are parsed into plain blocks (`shared/richtext.ts`) and rendered as React elements: no outside HTML reaches the page, links keep only http(s) targets.
- `images.ts` is the image proxy (`/api/civitai/image?u=…`): every picture is fetched once into `runtime/cache/civitai/images/` and served with immutable caching. Only Civitai's hosts may be fetched, checked at every redirect hop; only real image bytes are kept (a video or page is refused); videos are asked for as a still first frame.
- `lib/remote.ts` follows redirects by hand so the `Authorization` header goes only to Civitai's own origin, never to the storage host a download redirects to.

**Downloads are a server queue** (`services/downloads.ts`), like the generation queue:

- A few run at once (Settings → Civitai); progress goes out on the live bus (`downloads` topic: queue snapshots on changes, byte counts batched at 4 Hz). The header shows a downloads chip next to the generation queue.
- Each file streams into `<target>.part` next to where it lands (same drive, so finishing is a rename) through `lib/fsx.ts` (`openPartFile`, `commitPart`, `writeFileIfAbsent`). Resume sends an HTTP range request; a server that ignores it restarts the file.
- Civitai files are checked against Civitai's SHA256 before they're moved into place. `commitPart` never replaces a file: a taken name gets " (2)".
- Where a file lands is a pure function in `shared/downloads.ts`: `<kind folder>/<base model>/<category>/<creator>/<name>` with the parts, author aliases and naming chosen in settings; the model page previews it and can override the kind folder and subfolder.
- A finished Civitai download gets `.civitai.info` and `.preview.png` next to it (unless turned off), its hash and Civitai match go into the lookup tables, and the model lists refresh.
- Every download is a row in the profile's database. Unfinished ones come back paused when the profile opens again; History lists them all.

**Local models are matched by hash** (`services/lookup.ts`): models without a `.civitai.info` file are hashed in the background (smallest first, one at a time) and looked up by SHA256; answers are cached in the profile's database by path + size + mtime and fill names, thumbnails, base models and trigger words in Models → Local and the Generate pickers. Nothing is written next to the models.

**The Manager store** reads ComfyUI-Manager's `model-list.json` (cached for a day in `runtime/cache/manager/`, the cached copy used offline) and installs through the same queue into the folder the catalog names. Entries that belong in a custom node's folder are shown but not installable.

**Tests and dev checks** use `services/civitai/fixtures/fake-civitai.ts`: the API, an image CDN, ranged downloads with redirects, an early-access file and a model catalog, with deterministic file bytes so hashes are known. `--civitai` and `--catalog` point the server at it.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Server proxy + server queue (chosen)** | Key stays on the server; one cache for every window; downloads survive reloads and restarts; progress on the bus | More server code |
| Client calls Civitai directly | Less code | The key would live in the page; CORS; no shared cache; images from a third party in the page |
| Browser downloads | Nothing to build | Lands in the Downloads folder, not the models folder; no sorting, sidecars or resume control |
| Spawn aria2 / a download tool | Fast, mature resume | Another binary to ship and keep portable; progress and errors through a second process |
| Write partial files into `runtime/` | Models folder never sees a `.part` | Moving 20 GB across drives at the end; a crash leaves big files in `runtime/` |

## Consequences

- Browsing back and forth, reopening models and restarting the app don't ask Civitai again within the cache times; deleting `runtime/cache/civitai/` is safe.
- A `.part` file can sit in the models folder while a download is paused; ComfyUI ignores it (not a model extension). Cancelling removes it; it is the only kind of file Blombo ever deletes there.
- The Civitai key is in `secrets.json` in plain text, like any local app's token; it never leaves the profile folder except in requests to Civitai.
- Not covered yet: Civitai rate limits beyond backing off the lookup, Hugging Face logins for gated catalog files, and picking which version to keep when several are installed.
