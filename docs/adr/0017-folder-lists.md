# ADR-0017: Ordered folder lists per profile, the first one main

**Status:** Accepted
**Date:** 2026-11-02
**Deciders:** nyaridev

## Context

A profile had one models folder, one outputs folder and one wildcards folder (`profile.paths`),
plus extra gallery libraries kept in `settings.json` (`gallery.libraries`). Model libraries and
wildcard packs are often spread over several drives, and the owner's earlier app let you add any
number of folders per kind, with one main folder that receives new files.

## Decision

- **`profile.folders = { models, outputs, wildcards }`**, each an ordered list of
  `{ id, name, path }` (`shared/profile.ts`). The **first is main**: downloads (Civitai, Manager),
  generated images, script grids and batch results go there. The others are read, and what they
  hold can be edited (renamed, moved, rolled, rated) but Blombo never saves new files into them.
- **Ids** are unique per kind, made from the name (`folderIdFrom`) and editable in Settings →
  Folders. The first folder of a kind gets the old built-in id (`models`, `outputs`,
  `wildcards`), so gallery marks keyed by the old outputs library still match.
- **Order decides clashes**: the same model file in two folders, or the same wildcard name, comes
  from the higher folder (as ComfyUI does with `extra_model_paths.yaml`). Model ids stay relative
  paths (`loras/x.safetensors`); `LocalModel.root` says which folder a model came from.
- **ComfyUI** gets one `extra_model_paths.yaml` section per models folder (`blombo`, `blombo_2`…),
  the main one `is_default`, so ComfyUI downloads land there too.
- **Wildcards:** the Wildcard Manager shows each folder as a top-level row; its paths start with
  the folder id (`main/outfits/fantasy.txt`). Files move only within one folder. A `.txt` that a
  higher folder overrides is marked.
- **Gallery libraries are the output folders.** All images shows every folder; the sidebar filters
  one. Adding or removing a library in the sidebar edits `folders.outputs`; the main one can't be
  removed there. When an output folder's id changes (same path), its index rows, ratings, tags,
  collection items and trash entries are relabeled instead of re-indexed.
- **Migration:** a version 1 `profile.json` (`paths`) is converted when it's first read, with the
  old `gallery.libraries` appended after the main output folder, and written back as version 2.
  `gallery.libraries` is no longer part of the settings schema.

## Consequences

- One list per kind, edited in one place (Settings → Folders), saved as a draft so a models change
  restarts a managed ComfyUI once.
- Creating a profile still takes one path per kind (the wizard), turned into one-folder lists.
- Older Blombo builds can't read a version 2 profile; going back means restoring `profile.json`.
