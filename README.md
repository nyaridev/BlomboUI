<div align="center">

<img src="src-tauri/app-icon.svg" width="72" height="72" alt="BlomboUI logo" />

# BlomboUI

**A profile-based studio for ComfyUI.** Import any workflow, shape the Generate screen the way you work, and keep your models, images and wildcards in one place.

[![Node](https://img.shields.io/badge/Node-22.18%2B-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Desktop-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![ComfyUI](https://img.shields.io/badge/Engine-ComfyUI-1F1F1F)](https://github.com/comfyanonymous/ComfyUI)
[![Status](https://img.shields.io/badge/status-alpha%20%C2%B7%20Phase%205-orange)](#roadmap)

[Quick start](#quick-start) · [What it does](#what-it-does) · [How it works](#how-it-works) · [Development](#development) · [Docs](#documentation) · [Roadmap](#roadmap)

</div>

---

## Quick start

**You need:** [Node.js](https://nodejs.org/) 22.18 or newer. For the desktop window, also [Rust](https://rustup.rs) (one-time build).

| | Windows |
|---|---|
| **In your browser** | double-click `start-web.bat` → opens http://127.0.0.1:4380 |
| **As a desktop app** | double-click `start-app.bat` → opens the BlomboUI window |
| **For development** | double-click `start-dev.bat` → hot reload on http://127.0.0.1:4382 |

The first run installs dependencies and builds what's needed. After that, launches take a second or two.

There's no installer: BlomboUI runs from this folder, and everything it saves stays here, in `data/` (your profiles) and `runtime/` (ComfyUI, caches, the desktop window's data). Move or back up the folder and everything comes along; delete it and nothing is left behind (your own models and outputs folders aren't touched).

On first launch you'll see the **profile screen**. Create a profile: give it a name, a picture and a color, point it at your models, outputs and wildcards folders, choose a ComfyUI install, and pick starter workflows. Open it and you're on the Generate screen.

> **Status:** Phase 5 (polish), the last feature phase. New in it: Settings → Overview counts what you made (images per day, GPU time, speed, most used models, LoRAs and wildcards), **Help** (F1) explains getting started, models, workflows, stages and batch tools with a prompt guide and a live playground, **Scopes** keep a picture of each model per style (picked by hand or from the prompt's tags), a **command palette** (Ctrl+K) jumps anywhere, **keyboard shortcuts** can be rebound, Windows notifications say when long runs, batches and downloads finish, History lists every generation with **Run again**, the prompt has a recent-prompts and **snippets** menu, dropping an image on Generate reuses its settings, the gallery has **ratings, tags and collections**, pickers put favorite and recent models first, the image stage shows time and it/s per stage, a first-run **tour** walks the Generate screen, and a whole profile **exports and imports** as a zip. Before that, Phase 4b: Generate runs on ComfyUI (a managed slot the app installs for you, or your own ComfyUI URL), with built-in SD 1.5 / SDXL / Illustrious workflows, importing any ComfyUI workflow (JSON, PNG, WebP), wildcards and `<lora:…>` tags, a server-side queue, and live progress and previews. The gallery indexes your outputs and extra folders (search, favorites, trash, a lightbox with "use these settings"), File Info reads images and safetensors files, Models → Local shows your model files, and the Wildcard Manager edits .txt and .yaml wildcards. Models → Civitai browses and downloads from Civitai inside the app (a download queue with resume, smart folders and info files), Models → Manager installs from the ComfyUI model catalog, and local models without info files are matched on Civitai by hash. Hires fix, ADetailer (units, detector + SAM) and ControlNet (units, image from upload, gallery or the last output, preprocessors) splice into any workflow and say what's missing before you run (the custom nodes they need install from the notice on a managed slot); the prompt editor autocompletes tags, LoRAs, trigger words and wildcards (Ctrl+↑/↓ for weights); layouts are saved in the profile and linked per workflow. **Edit in ComfyUI** opens a workflow in ComfyUI with the bundled blombo-bridge extension (Save to Blombo keeps your values, Send to Blombo imports any canvas), workflows export and import as `.blombo` files, scripts (prompt matrix, XY plot with a labeled grid, scope thumbnails) queue many images from one click, and batch workflows (remove background, upscale, caption, dataset prep) run over a folder or files. See the [roadmap](#roadmap).

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
| **Scopes** | A picture of each model per context (Anime, Photo…), made by a script or picked from the gallery; cards and pickers show the scope you pick, or the one your prompt's tags point to. |
| **Help & shortcuts** | A Help view (F1) with a prompt guide and playground, a first-run tour, a command palette (Ctrl+K) and shortcuts you can rebind. |
| **Wildcards** | File tree and a YAML editor with folding, lint and reference autocomplete, a line-by-line mode, and a roll preview. |
| **Desktop or browser** | The same app in a native window (Tauri) or any browser. |

The complete feature inventory, with what's kept, new, or suggested, lives in [`docs/review/features.html`](docs/review/features.html).

## How it works

```text
┌────────────── Browser tab or Tauri window ──────────────┐
│  React 19 · TanStack · Zustand · Motion · Floating UI    │
└───────────────┬───────────────────────────┬──────────────┘
                │ HTTP (/api)               │ WebSocket (/api/live)
┌───────────────▼───────────────────────────▼──────────────┐
│  BlomboUI server · Node 22 + Hono · Zod schemas (shared)  │
│  profiles · workflows · jobs · gallery · models · civitai │
│  data/profiles/<id>/  (JSON files + one SQLite index)     │
└───────────────┬──────────────────────────────────────────┘
                │ /prompt · /ws · /object_info
┌───────────────▼──────────────────────────────────────────┐
│  ComfyUI (own Python + Torch) + blombo-bridge extension   │
└──────────────────────────────────────────────────────────┘
```

- **One language.** TypeScript end to end. Every shape that crosses the wire or lands on disk is one Zod schema in `src/shared/`.
- **Workflows are data.** A workflow is a real ComfyUI graph plus a manifest of *bindings* (UI parameter → node input) with semantic *roles*, so smart features attach to any graph.
- **The Generate screen is data.** It renders from a layout document; the default is one preset among yours.
- **Push, don't poll.** One WebSocket carries progress, previews, GPU stats, downloads and errors.
- **Your files stay readable.** Profiles, settings, workflows and layouts are JSON in your profile folder.

Details: [`docs/architecture.md`](docs/architecture.md) and the [decision records](docs/adr/).

## Project layout

```text
BlomboUI/
├── start-web.bat · start-app.bat · start-dev.bat
├── src/
│   ├── shared/      Zod schemas, vocabulary, prompt tokenizer, layout + workflow formats
│   ├── server/      Hono server: routes, services, file helpers
│   └── client/      React app: app shell, features, ui (design system), icons, styles
├── src-tauri/       Desktop window (Rust, Tauri 2)
├── docs/            architecture · design-system · workflows · adr/ · review/
├── tools/           build checks, dev window, icon generator, AI rules sync
├── data/            your profiles (created on first run, not in git)
└── runtime/         ComfyUI installs, caches, logs, desktop window data (not in git)
```

## Development

```bash
npm install
```

```bash
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | API on :4381 (restarts on change) + Vite on :4382 with HMR |
| `npm run dev:app` | The same inside the desktop window |
| `npm run start` / `start:app` | Production build + server on :4380 (browser / window) |
| `npm run check` | Typecheck, lint, tests and the AI-rules sync check |
| `npm run format` | Biome format + safe fixes |
| `npm run rules:sync` | Regenerate `.cursor/rules` from `.claude/rules` |

**Design Lab:** open `/lab` (or the avatar menu → Design Lab) to see every token, icon and control in every theme and accent. New controls aren't done until they're in the Lab.

**Working with AI agents:** [`AGENTS.md`](AGENTS.md) is the guide for every agent. Claude Code also reads [`CLAUDE.md`](CLAUDE.md), area rules in `.claude/rules/` (mirrored to `.cursor/rules/` for Cursor), and subagents in `.claude/agents/` (`ui-craftsman`, `workflow-engineer`, `server-engineer`, `reviewer`).

## Documentation

| Doc | Read it for |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | The system map: server, client, storage, workflows, live bus |
| [`docs/design-system.md`](docs/design-system.md) | Tokens, type, motion, icons, components, copy |
| [`docs/workflows.md`](docs/workflows.md) | Workflow packages, roles, import, stages, compile, export |
| [`docs/adr/`](docs/adr/) | Why the big decisions were made (0001–0015) |
| [`docs/review/features.html`](docs/review/features.html) | Feature inventory and review decisions |

## Roadmap

| Phase | Scope | State |
|---|---|---|
| **0 · Foundation** | Design system, icons, Design Lab, app shell, profiles, launchers, Tauri window, docs | done |
| **1 · Generate core** | ComfyUI supervisor, live bus, workflow packages, analyzer, presets, compiler, queue, image stage (the import setup screen still open) | done |
| **2 · Library** | Gallery index and showcase, File Info, local models, Wildcard Manager, UI font setting, installing ComfyUI from the app | done |
| **3 · Online** | Civitai account and browser, model pages, download queue, Civitai lookup of local models, ComfyUI Manager store, History | done |
| **4a · Generate** | Hires / ADetailer / ControlNet stages (with one-click custom node install), prompt autocomplete and weight keys, layouts saved in the profile and linked per workflow | done |
| **4b · Bridge** | ComfyUI bridge extension, `.blombo` export and import, scripts, batch utilities | done |
| **5 · Polish** | Settings stats, Help and prompt guide, Scopes, command palette, notifications, shortcuts, generation history, snippets, gallery ratings / tags / collections, tour, profile export | **in review** |
| **Final pass** | Merge the phase branches, large-gallery performance, accessibility, checks on a real ComfyUI | |

## Requirements

- Windows 10/11 (Linux later), Node.js 22.18+
- An NVIDIA GPU for ComfyUI; BlomboUI installs and manages ComfyUI in `runtime/`, or connects to yours
- Rust toolchain only to build the desktop window (once)
