# ADR-0018: The workflow check: missing custom nodes and models, and their fixes

**Status:** Accepted (built on `main`; clicked through against the fake ComfyUI, fake installs and the fake Civitai's catalog and node map on 2026-11-06)
**Date:** 2026-11-06
**Deciders:** nyaridev

## Context

An imported workflow often needs custom nodes or model files this ComfyUI doesn't have. The import said so in one toast ("Missing custom node X. Install it with ComfyUI Manager"), and then the workflow just failed to run. Stages already install their pinned packs in one click (ADR-0013) and missing models offer the Manager, so the owner asked for the same for any workflow, warning that **some workflows use nodes ComfyUI-Manager doesn't list**.

Constraints:

- A pack is code. ADR-0013 allowed only packs Blombo's own packages pin, so the page could never make Blombo fetch a repository.
- A UI-format import leaves out nodes ComfyUI doesn't know (the converter can't read their inputs), so installing them isn't enough: the workflow's API graph must be made again from its canvas.
- Viewing a workflow never changes its files.

## Decision

**The check** (`services/workflows/health.ts`, pure; `services/workflowcheck.ts`, the service; `GET /api/workflows/:id/health`) reports, while ComfyUI is running:

- **Custom nodes**, grouped by pack. For each class object_info doesn't know (in the API graph and on the canvas, muted and bypassed nodes left out), the pack is, in order: one Blombo's stages or presets pin (`blombo`); the repository and commit ComfyUI saves on each node of the canvas (`properties.aux_id`, `properties.ver`; `workflow`); ComfyUI-Manager's `extension-node-map.json` (`manager`, `services/nodemap.ts`, fetched daily next to the model catalog and following `--catalog`). Only github.com repositories count. Classes none of these know are listed as **unknown**.
- **Models**: node inputs whose value isn't among ComfyUI's choices, when the input is a model input or the value is a model file. A download is offered when ComfyUI-Manager's catalog has the same file, else when the workflow links it (`properties.models`, which ComfyUI saves for templates) on Hugging Face. Otherwise Find in Manager and Search Civitai.
- **Rebuild**: the canvas has nodes the API graph lacks and ComfyUI knows them now.

Generate shows it above the prompt (`features/generate/WorkflowCheck.tsx`) and refetches it when ComfyUI connects, nodes install, models change or the workflow is saved.

**Installing** goes through the same installer as stages (ADR-0013), which now also takes **confirmed** packs: ones the user said yes to in a dialog that names each pack, its repository, where Blombo found it and the commit. A pack without a pinned commit is pinned to its default branch's latest commit at install time (`InstallOps.latestCommit`, GitHub's API) and recorded in `packs.json`. For unknown classes the user can paste a GitHub repository; it goes through the same dialog. The server works the check out again for every fix and only installs packs it found, plus a pasted repository only for classes it lists as unknown. External ComfyUIs get the how-to, as before.

**Downloads** queue the catalog entry (`source: "manager"`) or a new `source: "url"`, which only the check can queue (the `/api/downloads` route still takes Civitai and Manager only), only for Hugging Face (or the `--huggingface` fake) and only for the file name the workflow names.

**Rebuild** converts the canvas again (`uiToApi`), carries values over like a save from ComfyUI (`resync`) and replaces the graphs with the old files in the profile's trash (`replaceGraphs`). It's a button, never automatic.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| **Check + confirmed install of found packs (chosen)** | Works for packs Manager doesn't list (the workflow names them, or the user does); the user sees the source before code runs | Packs not pinned by the workflow float to their latest commit; a pasted repository is only as safe as the user's judgement |
| Keep ADR-0013's allow-list | Nothing new to trust | The dead end the owner asked to remove |
| Install ComfyUI-Manager in the slot and drive it | Its database, security levels and install scripts | Another moving part in every slot; versions float the same way; external tool's UI conventions |
| Comfy Registry API (`cnr_id`) | Versioned packs | Another service; most saves also carry `aux_id`, and Manager's map covers registry packs |

## Consequences

- An imported workflow says what it needs where you generate, and most of it fixes in one or two clicks.
- Custom nodes can now come from any GitHub repository the user confirms. The guard (`lib/guard.ts`) keeps other sites from calling these routes, and the dialog says that custom nodes run code.
- `install.py` scripts still don't run (ADR-0013); a pack that needs one fails its verify step with a pointer to the log.
- Not covered yet: non-GitHub repositories, the Comfy Registry, updating or removing installed packs, and Civitai download links inside workflows.
