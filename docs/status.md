# Status

**All phases are built** and merged into `main` (Phases 0–5 plus a final pass of review fixes,
performance, accessibility and contrast work). This is release **1.0.0**: everything has tests (`npm run check`:
typecheck, lint, 443 tests, rules sync) and was clicked through against a **fake ComfyUI and a fake
Civitai**; on 2026-10-21 the parts that need a real ComfyUI were run on one too (see below).

## Verified

| | Verified |
|---|---|
| Generate on a **real** ComfyUI (SD 1.5, live progress, previews, outputs) | Yes, in Phase 1 and again in the real-ComfyUI checks (ComfyUI 0.42.1, 26.6 it/s on an RTX 5080) |
| Everything else (stages, scripts, batch tools, bridge, gallery, models, Civitai, downloads, history, palette, shortcuts, tour, export) | Against the fake ComfyUI / fake Civitai, in the browser (Blombo and Light themes) and in tests |
| Gallery with 20,000 images, startup bundle | Measured, see [`performance.md`](performance.md): first index 5.2 s, search about 10 ms, smooth virtual scrolling, first screen 236 KiB gzip |
| Keyboard and screen-reader basics | Every main view: no unnamed controls, visible focus on every stop, modal layers keep focus; text contrast tested for every theme and accent |
| Installing a managed ComfyUI slot; Hires fix, ADetailer and ControlNet with their custom node packs installed from the notices; the upscale, caption, dataset-prep and remove-background batches; blombo-bridge in the real ComfyUI frontend | Yes, on real models in a throwaway folder: all six checks passed, nothing written outside BlomboUI's folder except four empty uv lock files in %TEMP%. Results: [`review/real-comfyui-checks.md`](review/real-comfyui-checks.md) |
| Civitai with a real account and key, SDXL / Illustrious and diffusion-model (Flux-style) workflows, the external-ComfyUI bridge install | Not yet (fake Civitai and fixture tests only) |
| The Tauri desktop window | Built in Phase 0, not re-checked in the final pass |

## What it does

| | |
|---|---|
| **Profiles** | Start on a profile screen. Each profile has its own folders, workflows, layouts, settings, avatar and accent color. Switch without restarting. |
| **Workflows** | Drag in any ComfyUI workflow (JSON or a ComfyUI image) and BlomboUI sets it up: prompts, models, sampler, size, LoRAs. Your settings save into the workflow. **Duplicate** to branch, **Edit in ComfyUI** to change the graph and **Save to Blombo** to bring it back. Export as `.blombo`. |
| **Generate** | Loaded models on top, a prompt editor with syntax colors, Generate / Interrupt / Cancel, parameter cards and a live image stage. **Customize** moves any block and switches controls between slider, scrub bar, number, chips, buttons and dropdown. Layouts are saved in the profile and linked per workflow. Prompt autocomplete for tags, LoRAs, trigger words and wildcards. |
| **Stages** | Hires fix, ADetailer (multiple units) and ControlNet that inherit your base settings until you change them. They work on imported workflows too. |
| **Gallery** | A showcase of your images: featured favorites, day sections in justified rows, extra library folders, search across prompts and models, favorites, star ratings, your own tags and collections across folders, a trash you can restore from, and a lightbox with the full parameters and **Use these settings**. New images appear as they're generated. |
| **File Info** | Drop an image to see how it was made (BlomboUI, ComfyUI or A1111 metadata, the embedded graph) and import its workflow, or a `.safetensors` file to read its training details and tags. |
| **Models** | Local models with one consistent card (thumbnails from the files next to them, NSFW blurred until clicked, a designed face when there's none), an info sheet, rename and move. A fast **Civitai browser** (filters, saved filters, model tabs, in-app model pages) with a **download queue** that sorts files into folders, resumes and saves previews; a **ComfyUI model store**; and background matching of your files on Civitai for thumbnails and trigger words. |
| **Help & shortcuts** | A Help view (F1) with a prompt guide and playground, a first-run tour, a command palette (Ctrl+K) and shortcuts you can rebind. |
| **Wildcards** | File tree, new .txt or .yaml files, a line-by-line mode, YAML as sections of keys (the old app's dashboard), a raw editor with folding, lint and reference autocomplete, and a roll preview. |
| **Desktop or browser** | The same app in a native window (Tauri) or any browser. |

The complete feature inventory, with what's kept, new, or suggested, lives in [`review/features.html`](review/features.html).

## Roadmap

| Phase | Scope | State |
|---|---|---|
| **0 · Foundation** | Design system, icons, Design Lab, app shell, profiles, launchers, Tauri window, docs | done |
| **1 · Generate core** | ComfyUI supervisor, live bus, workflow packages, analyzer, presets, compiler, queue, image stage (the import setup screen still open) | done |
| **2 · Library** | Gallery index and showcase, File Info, local models, Wildcard Manager, UI font setting, installing ComfyUI from the app | done |
| **3 · Online** | Civitai account and browser, model pages, download queue, Civitai lookup of local models, ComfyUI Manager store, History | done |
| **4a · Generate** | Hires / ADetailer / ControlNet stages (with one-click custom node install), prompt autocomplete and weight keys, layouts saved in the profile and linked per workflow | done |
| **4b · Bridge** | ComfyUI bridge extension, `.blombo` export and import, scripts, batch utilities | done |
| **5 · Polish** | Settings stats, Help and prompt guide, command palette, notifications, shortcuts, generation history, snippets, gallery ratings / tags / collections, tour, profile export | done |
| **Final pass** | Phases merged into `main`, whole-codebase review and fixes (API only for Blombo's own pages, safer saved data, queue and profile-switch fixes), 20k-image gallery and startup bundle, keyboard and contrast pass | done |
| **Folder lists** | Several models, output and wildcards folders per profile, the first one main (ADR-0017); gallery libraries are the output folders | done |
| **Real-ComfyUI checks** | Stages and batch tools on real models and packs, the bridge in the real frontend, the slot installer ([results](review/real-comfyui-checks.md)) | done |
