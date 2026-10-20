# ADR-0013: Installing the custom node packs stages need

**Status:** Accepted (built in Phase 4a, on `main`; all five pinned packs installed from the notices into a real managed slot on 2026-10-21)
**Date:** 2026-10-20
**Deciders:** nyaridev

## Context

ADetailer needs ComfyUI Impact Pack and Impact Subpack; ControlNet's preprocessors need comfyui_controlnet_aux (ADR-0004). Until now the stage notice said "Needs custom nodes" and could only link the repositories and ComfyUI, while a missing model already offered **Find in Manager** and a download. The owner wanted the same: **Install**, from the notice, with progress.

Constraints:

- Everything stays in `runtime/` (the slot) and nothing touches the system Python, as in ADR-0010.
- A pack is code that ComfyUI imports. Blombo must not become a way to install arbitrary repositories from the page.
- Windows locks the `.pyd` files a running Python has loaded, so `pip` can't replace a package that a running ComfyUI imported.
- A pack's `requirements.txt` must not quietly replace the slot's CUDA PyTorch with a CPU build from PyPI.
- An external ComfyUI is the user's; Blombo doesn't change it.

## Decision

`services/comfy/nodepacks.ts` installs packs into the active profile's **managed slot** and reports on the live bus (`install` topic, `nodes.install` messages). Steps, built per install:

1. **download:&lt;folder&gt;**: GitHub's source zip at the commit the stage package pins (`packs[].ref` in `stage.json`), unpacked into `<slot>/blombo/tmp/` and moved whole into `ComfyUI/custom_nodes/<folder>` (the repository name, as ComfyUI-Manager names it). A folder that's already there under any Manager spelling (`ComfyUI-Impact-Pack`, `comfyui-impact-pack`) is kept and skipped.
2. **stop**: ComfyUI, if it's running (file locks).
3. **packages:&lt;folder&gt;**: `uv pip install -r requirements.txt` into the slot's Python, with a constraints file (`<slot>/blombo/constraints.txt`) pinning the installed torch, torchvision and torchaudio from `uv pip freeze`, so a conflicting pack fails loudly instead of swapping PyTorch.
4. **restart** and **verify**: start ComfyUI again, wait until it's connected, and check `/object_info` has every class the pack provides; otherwise say which pack didn't load and point at ComfyUI's log.

If ComfyUI was stopped to begin with, there's no restart: the result says the nodes load the next time it starts. A failed or cancelled install starts ComfyUI again if it stopped it. Installed packs are recorded in `<slot>/blombo/packs.json` (folder → url, ref, time).

The server accepts only repository URLs that a stage package lists **with a pinned ref**; the page never sends a URL Blombo would fetch. It refuses while jobs are queued or running (the restart would cut them off), while a slot is being installed, and for external ComfyUIs, where the answer is the how-to (ComfyUI-Manager or `git clone`). The stage check says "Install adds them to this ComfyUI and restarts it." for a managed slot and keeps the ComfyUI-Manager instructions for an external one.

uv handling (`ensureUv`, the private environment, `uv pip` with progress, zip extraction) moved from the slot installer into `services/comfy/uv.ts`, shared by both installers.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Source zip at a pinned commit (chosen)** | No git needed (portable, like the ComfyUI zip in ADR-0010); the exact code that was checked; resumable per pack | No `.git`, so ComfyUI-Manager can't `git pull` it; updating means bumping `ref` |
| `git clone` + checkout | Manager can update it later | Needs git on PATH (not a given on Windows); a second tool to keep portable |
| ComfyUI-Manager's custom-node-list / its API | The catalog users know; it handles install scripts | Needs Manager installed in the slot; its install path runs `install.py` scripts we don't control; versions float |
| Keep linking to the repositories | No code | What the owner didn't want: a dead end next to models that install in one click |

## Consequences

- ADetailer and ControlNet go from "Needs custom nodes" to working in one click on a managed slot. The fake ComfyUI (`--custom-nodes DIR`) and the server's `--fake-comfy` dev flag let the whole flow be clicked through with no download.
- Packs' `install.py` scripts are not run (only `requirements.txt`). If a pinned pack needs its script, it shows up as a failed verify, and the fix goes in the package (another ref) or in this service.
- Bumping a pack is a one-line `ref` change in the stage packages; existing folders are kept, so an update of an installed pack isn't offered yet.
- Not covered yet: updating or removing packs, packs for user stage packages, and running the real packs against a real ComfyUI (needs the owner's OK to download them).

## Update (Phase 4b)

Built-in batch workflows list their packs too (`packs` in `presets/workflows/<id>/workflow.json`: Inspyrenet Rembg, WD14 Tagger). The installer's allow-list is now the stage packages plus the built-in presets folder; a manifest from a profile or an import is never trusted for this. Their notice is the same component, fed by `GET /api/batch/check/:id`.

