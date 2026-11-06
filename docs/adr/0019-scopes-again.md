# ADR-0019: Scopes again: pictures per scope and per combination, off by default

**Status:** Accepted (built; checked in the browser on a throwaway profile, Blombo and Light themes)
**Date:** 2026-11-06
**Deciders:** nyaridev

Supersedes the picture layout of [ADR-0016](0016-model-pictures-without-scopes.md) and brings back,
reworked, the scopes it removed (first built in ADR-0015).

## Context

One picture per model (ADR-0016) isn't enough for LoRAs whose look depends on the prompt: the
owner wants a LoRA to show how it looks with a skirt, with thighhighs, and with both. The old app
did this with scopes: random ids, a picture per scope or per sorted combination of ids
(`thumbs/<id>+<id>.jpg`), `thumbs/global.jpg` for everyone, and a picker where scopes could be
required or optional. Its files are still next to the owner's models (`model_data.json` names
`global.jpg` / `global_raw.png`). Blombo's first scopes kept pictures in the profile, one scope
at a time, and were dropped as unused.

## Decision

**Files next to the model, the old app's names.**

```text
Detailer_data/thumbs/global.jpg                    what cards show with scopes off, and the fallback
Detailer_data/thumbs/global_raw.png                its full size (or .mp4, .webp…)
Detailer_data/thumbs/<id>.jpg (+ <id>_raw.png)     a picture for one scope
Detailer_data/thumbs/<id>+<id>.jpg                 a picture for a combination (ids sorted)
```

A picture's *key* is its name without the extension: `global`, or 1–6 scope ids joined by `+` in
sorted order (`pictureKey`, `cleanKey` in `shared/scopes.ts`), so a combination has one name
whatever order it was picked in. Only names that are keys are Blombo's; `model_data.json` and
other files are left alone. The flat layout of ADR-0016 (`thumb.*`, `thumb_raw.*`) isn't read any
more: `node tools/move-model-pictures.ts <models folder>` moves it to `thumbs/global.*` (never
over a picture that's there), and was run on the owner's library.

**Scopes belong to the profile.** `data/profiles/<id>/scopes.json` (`blombo.scopes/2`):
`enabled` (false by default), the scopes (`id`: 12 random hex characters, `name`, an optional
`group`, prompt `tags`) and the `view` (picked ids, which of them are optional, `auto`). Renaming
a scope never touches a file. Deleting one moves every picture whose key has its id to the
profile's trash (`trash/model-pictures/`), then forgets it.

**Which picture a card shows** (`pickPicture`, pure, on the client from `LocalModel.pictures`):

- Scopes off, or nothing picked: the global picture.
- A picture fits when it has every *required* picked scope; with only optional ones picked, at
  least one of them.
- Of those: the one with the most picked scopes, then the fewest scopes nobody picked, then the
  newest. Picking Skirt shows a Skirt picture before a Skirt + Thighhighs one, and the
  combination when that's all there is.
- Nothing fits: the global picture (then Civitai's, then the drawn fallback).

**Picking** is the scope bar beside Models → Local's and the Generate pickers' filters (shown
only while scopes are on): picked scopes are chips (click: required ↔ optional, ×: drop), a
Scopes menu adds them (picking one drops the others of its group), and Auto takes them from the
Generate prompt's tags instead (`autoScopes`: every scope with a tag in the prompt, the best one
per group; Auto's picks are all optional). One `ScopeFollower` in Shell works the pick out, so
cards re-render only when it changes.

**Setting pictures:** the model info dialog's *Picture for* (Global, or any scopes; several make
a combination) picks which picture it shows and what Replace picture and Remove change; it starts
on what cards show right now and lists the model's other pictures. Civitai downloads and the
Thumbnails script write the global picture only. Scopes are turned on and managed in the avatar
menu → Scopes.

API: `GET/PATCH /api/scopes`, `POST /api/scopes`, `PUT/DELETE /api/scopes/:id`; the picture
routes (`/api/models/thumb`, `/picture/raw`, `PUT/DELETE /picture`) take `?scope=<key>`
(URL-encoded: `+` in a query is a space).

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Scope ids in file names next to the model (chosen)** | The old app's layout, so its pictures keep working; pictures travel with the model; renames are free | Another profile on the same models folder doesn't know the ids (it ignores those pictures) |
| Scope names in file names | Readable folders | A rename touches every model's files; names need escaping |
| Pictures in the profile (ADR-0015) | Models folder untouched | Lost when the model moves to another PC; the owner's library already has the other layout |
| Scopes in settings.json | One store | It's data (a list with ids), not a setting; deleting needs to move files |

## Consequences

- A scope list belongs to one profile. Two profiles on the same models folder each see only their
  own scopes' pictures (the global ones are shared). Exporting a profile carries `scopes.json`.
- Models in a folder that had Blombo's flat layout show no picture until
  `tools/move-model-pictures.ts` is run on it.
- Deleting a scope only trashes pictures of models the current scan sees (a model hidden behind
  the same file in a higher folder keeps its pictures).
- Not built: setting a scope picture from the Thumbnails script (it has no UI yet), exclude tags
  and priorities from the old app's scope rules, and listing pictures of deleted scopes in
  Settings → Leftovers.
