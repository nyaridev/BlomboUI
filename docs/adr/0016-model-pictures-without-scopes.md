# ADR-0016: One picture per model, next to it; scopes removed

**Status:** Accepted
**Date:** 2026-11-02
**Deciders:** nyaridev

## Context

Model pictures came from three places: a sidecar next to the model (`foo.preview.png`, `foo.png`…),
the "default" scope's picture in the profile (`data/profiles/<id>/scopes/default/<kind>/<name>.webp`),
and the other scopes, which swapped in a picture per context (ADR-0015). In practice one picture
per model is what's used, and the owner's model library already keeps it in a folder named after
the model (`Detailer_data/thumbs/global.jpg` + `global_raw.png`, written by another tool, with
that tool's `model_data.json` beside it). Blombo read none of that.

## Decision

- **Scopes are gone**: the Scopes view, the scope picker, "pick from the prompt", `scopes.json`,
  the per-scope pictures and their API. No migration: an existing `scopes/` folder in a profile is
  simply no longer read (and can be removed by hand).
- **A model's pictures live in the folder named after it**, next to the model:
  `<model>_data/thumb.jpg` is what cards show, `<model>_data/thumb_raw.png` the full-size
  original. Reading accepts `thumb.{jpg,jpeg,png,webp}` and any `thumb_raw.*` (some originals are
  videos). Only those two names are Blombo's; other files in the folder are left alone.
- **Only that layout is read.** `.preview.png` and other picture sidecars are no longer thumbnails
  (they still move with the model on rename and move).
- **Writers:** a Civitai download saves its first image there unless the model already has a
  picture; the Thumbnails script (formerly "Scope thumbnails") replaces the picture and moves the
  old one to the profile's trash (`trash/model-pictures/`). `services/modelthumbs.ts` owns both.
- **The data folder belongs to the model**: renaming or moving a model renames or moves
  `<model>_data` with it; the scan doesn't look for models inside it, and it isn't offered as a
  folder to move models into.
- The owner's library was moved to this layout once, by a script run outside the app
  (`thumbs/global.*` → `thumb.*`, `thumbs/global_raw.*` → `thumb_raw.*`).

## Consequences

- One place to look for a model's picture, shared with the other tool's folder layout, and it
  travels with the model (rename, move, copy to another machine).
- Blombo now writes into the models folder for pictures (it already did for downloads and their
  sidecars). Replacing never deletes: the old picture goes to the profile's trash.
- Setting a picture by hand (from a gallery image or an upload) went away with the Scopes view; it
  belongs on a model in Models → Local when it comes back.
- Pictures from other tools' `.preview.png` sidecars no longer show.
