# ADR-0010: Installing ComfyUI slots from inside the app with uv

**Status:** Accepted (built in Phase 2)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

In the feature review the owner chose "Inside the app with progress" over console prompts in the launcher for installing ComfyUI. A managed slot (`runtime/comfyui/<slot>/`) needs ComfyUI itself, a Python that matches it, PyTorch for the machine's GPU, and ComfyUI's requirements. The install must:

- show real progress and readable failures in the UI, and survive a page reload
- never touch the system Python, PATH, or registry, so removing `runtime/` removes everything
- resume after a dropped connection instead of starting over (PyTorch alone is several GB for CUDA)
- work on Windows first

## Decision

The server runs the install (`services/comfy/installer.ts`) and publishes its state on the live bus (`install` topic). Steps, each skipping work that's already done:

1. **tools**: download uv's Windows zip into `runtime/tools/uv/` (elsewhere: `uv` on PATH)
2. **python**: `uv venv --python 3.12 <slot>/.venv`, with uv's own standalone Python in `runtime/tools/python/` (`UV_PYTHON_PREFERENCE=only-managed`, no registry entries, no shims)
3. **comfyui**: the GitHub release zip (latest or a chosen tag), unpacked into `<slot>/ComfyUI/`
4. **torch**: `uv pip install torch torchvision torchaudio` from PyTorch's CUDA 12.8 or CPU index
5. **requirements**: `uv pip install -r ComfyUI/requirements.txt`
6. **verify**: import torch in the new Python; write `blombo/slot.json` (ComfyUI tag, torch version, CUDA or CPU)

`<slot>/blombo/installing` exists until verify passes; `findSlot` treats such a slot as unfinished, so the supervisor never starts a half-installed ComfyUI. The supervisor reads `slot.json` and passes `--cpu` for CPU builds. Network and process access go through an `InstallOps` interface, so tests run the whole flow with fakes.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **uv + private venv (chosen)** | Fast, scriptable, line-based output for progress; one exe; resumable; PyTorch index choice | Downloads uv itself first |
| ComfyUI's portable 7z build | The "official" Windows bundle | Needs 7-Zip to unpack; bundles one CUDA build; no per-step progress |
| pip + python.org embeddable Python | No extra tool | Embeddable Python lacks venv/pip setup; slow resolver; more steps to get right |
| Console prompts in the launcher | Simplest code | What the owner declined: no progress view, easy to get lost |

## Consequences

- A fresh slot installs from Settings → ComfyUI (and the header's **Install** when the profile's slot is missing). CPU-only installs work on machines without NVIDIA GPUs (slowly).
- The uv package cache in `runtime/tools/uv-cache/` makes a second slot much faster; deleting it is safe.
- Not covered yet: updating an installed slot, choosing other CUDA versions or ROCm, and installing blombo-bridge (ADR-0009) into new slots.
