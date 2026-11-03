# Design system

How BlomboUI looks, moves and reads. The Design Lab (`/lab`, or avatar menu → Design Lab; dev mode only, the built app hides it) shows everything on this page live, in every theme and accent. Decisions are recorded in [ADR-0007](adr/0007-design-system.md).

## Direction

A dark, calm, precise workspace for making images. The images are the color; the UI stays out of their way.

- **Deep blue-black surfaces**, one blue accent (the profile can change it), and **orange reserved for Generate** (`#e04800`, its own token, whatever the accent).
- **Tight corners, flat fills.** Controls have 4 px corners, cards 5, dialogs 6; nothing goes past 8. Fills are flat: no bevels, no glows, one tight shadow for floating layers. Only avatars, status dots, slider tracks and thumbs, switches and progress bars are fully round.
- **Hand-built controls.** No component-library look. Every control is drawn here and behaves the same everywhere.
- **Quick, physical motion.** Springs, not easing curves. Things respond at once and settle without wobbling.
- **Dense but breathable.** 13 px UI text, 8 px grid, generous gaps between groups and tight gaps inside them.
- **No glassmorphism, no gradients-as-decoration, no emoji icons.** Gradients only where they do a job: avatar monograms and accent swatches, placeholder art, and dark scrims behind text on images. The Generate button is a flat orange fill.

## Tokens

All raw colors live in `src/client/styles/tokens.css`. Tailwind sees only tokens: the default palette is cleared in `styles/index.css`, so `bg-red-500` doesn't exist.

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `bg` → `surface` → `surface-2` → `surface-3` | App → panels → cards → floating (menus, popovers) |
| Inputs | `field`, `field-hover`, `sunken` | Inputs sit on `field`; tracks and wells use `sunken` |
| Lines | `line`, `line-strong` | Borders; `line-strong` for hover and floating edges |
| Text | `fg` → `fg-2` → `fg-3` → `fg-4` | Body → labels → muted → hints, counts and disabled. Anything someone must read to use the app is `fg-3` or stronger |
| Brand | `accent`, `accent-ink`, `on-accent` | Fills use `accent`; text and icons on dark use `accent-ink` |
| Generate | `generate`, `generate-hi`, `generate-ink` | Only the Generate action, its progress and its queue |
| Palette | `red`…`pink` + `-ink` | Model-kind colors, tags, charts. `-ink` for text |
| Status | `success`, `warning`, `danger`, `info` | Always with an icon or a word, never color alone |
| Syntax | `syn-weight`, `syn-lora`, `syn-wildcard`, `syn-break`, `syn-escape`, `syn-invalid` | Prompt editor and the prompt guide |
| Depth | `shadow-card`, `shadow-pop`, `shadow-thumb`, `shadow-knob` | Cards (a hairline top edge), floating layers (one tight `0 8px 24px` shadow), slider and switch handles. Use them as `shadow-pop` / `shadow-[var(--…)]`; never write an `rgb()` shadow in a component. No glows, no bevels |

**Themes** (`blombo`, `slate`, `midnight`, `ember`, `moss`, `light`) override surface and text tokens on `<html data-theme>`. **Profile accents** (`blue`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `cyan`) override `--accent*` on `<html data-accent>`. Any subtree can preview another theme by setting `data-theme` on itself, which is how the theme picker cards work.

**Surface rule:** a control uses the token that contrasts with its *immediate* container: a `field` input on a `surface-2` card, a `sunken` track inside a `field`. Never skip a level to "make it pop".

## Type

- **Geist Variable** for UI by default, **Geist Mono Variable** for numbers, paths, seeds and code. Both are bundled with `@fontsource`, so they work offline.
- **The UI font is a setting** (Settings → Appearance → Font): Geist, Inter (bundled), Segoe UI, the system font, or any font installed on the computer. It's one token, `--font-ui` in `tokens.css`, switched by `<html data-font>` (a custom family is set inline); `font-sans` and the body read it, so everything follows at once. Mono never changes. Components never name a font family; use `font-sans` / `font-mono`.
- Scale (Tailwind names): `2xs` 11 · `xs` 12 · `sm` 13 (UI base) · `base` 14 · `lg` 16 · `xl` 20 · `2xl` 26 · `3xl` 34.
- `label-caps`: 11 px, 600, uppercase, 0.08em tracking, `fg-3`. For group titles inside panels.
- Numbers that line up use `tabular` (tabular figures). Seeds, sizes and VRAM are mono.
- Headings use `text-balance`. Page titles are `2xl semibold tracking-tight`.

## Shape and space

- Radius: `xs` 2 (badges on images, kbd, tiny chips) · `sm` 3 (small buttons, chips, tags) · `md` 4 (buttons, inputs, selects, Generate) · `lg` 5 (cards, menus, popovers, toasts) · `xl` 6 (dialogs, palette, image stage) · `2xl` 8 (the largest frames). Bare `rounded` is 4.
- `rounded-full` only for avatars, status and pager dots, color swatches, count badges, slider tracks and thumbs, switches, progress bars and spinners. Buttons (including icon buttons over images), chips, tags and badges with words are square-ish.
- Control heights: `sm` 28 · `md` 32 · `lg` 40. A toolbar row uses one height.
- Gaps: 4–6 inside a control group, 8–12 between controls in a card, 12–16 between cards, 24–40 between page sections.
- `card` utility: border + hairline top highlight + `radius-lg`. Use it for *objects* (a model, a stage, a stat), not for every block.

## Motion

Presets in `src/client/lib/motion.ts`:

| Preset | Feel | Use |
|---|---|---|
| `snappy` | stiff spring, no overshoot, ~100 ms | Menus, popovers, the palette, thumbs, tab and segment indicators, toggles |
| `bouncy` | small overshoot | Arrivals that deserve life: toasts, the Generate button press |
| `glide` | heavier, no overshoot, ~200 ms | Large surfaces: views, dialogs, sheets, collapsibles |
| `exitFast` | 70 ms fade | Anything leaving: menus, popovers, dialogs |

- Keep motion short: about 100 ms for direct responses, 200 ms at most for large surfaces; exits are quicker than entrances. Hover and state color changes use Tailwind's default transition, set to 90 ms in `index.css`. Rows that follow the pointer or arrow keys (menus, selects, the palette) change at once, with no transition. Data that changes over time (progress, temperature) may move slower. Never animate layout while the user is typing or dragging a value.
- Shared-element morphs use `layoutId`.
- Lists enter with a 40–70 ms stagger, once. No looping ambient animation except progress.
- `MotionConfig reducedMotion="user"` honors the OS setting. CSS transitions collapse under `prefers-reduced-motion`.

## Icons

`src/client/icons/paths.ts`: hand-drawn, 24×24 grid, 1.75 stroke, round caps and joins, `currentColor`. One `<Icon name size>` component renders them.

- **Name by action**: `unload-models`, `free-cache`, `rescan-models`, not `chip-arrow` or `broom`.
- Sizes: 14 in dense rows, 15–16 in buttons, 18–22 in empty states and tiles.
- Icon-only buttons always go through `IconButton`, which requires a `label` (tooltip + accessible name) and can show a shortcut.
- To add an icon: draw it on the 24 grid, paste the inner markup into `ICONS`, check it in the Lab next to its neighbors at 16 and 22 px.
- **The mark** is Nodey, a ComfyUI node with a face (`icons/Logo.tsx`, 32 grid). In the app its tile follows the profile accent and the output socket is generate orange (`--mark-socket`; white on the orange accent). The app icon (`src-tauri/app-icon.svg`, 512 grid), the favicon and the README banners (`assets/brand/`) use the fixed ink tile.

## Components (`src/client/ui`)

| Component | Notes |
|---|---|
| `Button` | `primary` · `secondary` · `outline` · `ghost` · `danger`; sizes `sm/md/lg`; `icon`, `iconRight`, `loading` |
| `IconButton` | Required `label`; `shortcut`; `active`; `badge` slot (`CountBubble`) |
| `TextField`, `TextArea`, `Field` | `Field` adds label, hint, error; `layout="left"` for settings rows. `invalid` gives a red outline, `valid` a green one (a checked path that exists) |
| `NumberField` | Drag the field to scrub (Shift = fine), click to type, wheel while focused, steppers |
| `Slider` | Track + thumb; value in the label row is click-to-type; double-click resets; `marks`; `tone="generate"` |
| `ScrubField` | Field-sized bar; drag anywhere, click to type. Best in dense layouts |
| `Select` | Custom listbox: groups, icons, hints, typeahead |
| `Switch`, `Checkbox`, `Segmented`, `Chip` | `Segmented` has a sliding thumb and arrow-key navigation |
| `Tabs` | `pill` (header) and `line` (panels), sliding indicator |
| `Tooltip`, `Popover`, `Menu`, `Dialog` | Floating UI behavior; `Menu` has typeahead and arrow keys |
| `Collapsible`, `InheritRow` | The stage pattern: header with summary + enable switch; inherited fields show the base value with a link toggle |
| `Notice` | Inline message with a status icon, text and the actions that fix it; `info` (something to pick), `warning` (something missing), `danger` (something broken) |
| `UnitTabs` | A stage's units as small tabs with their run order, a sliding indicator, a strike-through for units that are off, a warning mark for units missing something, and an add button up to `max` |
| `Badge`, `Kbd`, `StatusDot`, `Spinner`, `Skeleton`, `Meter`, `StageProgress`, `ProgressRing` | Feedback. `ProgressRing` is the small circle in header chips (generation queue, downloads), in the current text color. `Kbd onColor` sits on a filled surface (the Generate button). `Skeleton` stays hidden for its first 300 ms, so a fast local answer never flashes a placeholder |
| `Dialog` | Modal with title, body and footer; `bare` drops the body's padding and scrolling so panes fill it (the profile wizard) |
| `Sheet` | A side panel (`side="left"` or `"right"`) that slides in over the page, with Dialog's focus trap and dismiss. Narrow screens show sidebars in it: the gallery's libraries, model details |
| `Avatar` | Image or monogram on the profile accent: a circle with an accent ring, or `shape="card"` filling its container (profile screen cards) |
| `ModelCard`, `FallbackFace` | The one model card; designed fallback when there's no thumbnail. `nsfw` + `blurNsfw` blur the thumbnail until clicked (the first click only reveals); `meta` adds a small mono line (size); `mark` pins a status pill to the corner ("Installed" success, "Update" warning, "Downloading" accent); `typeLabel` shows the source's own type name ("LyCORIS") instead of the kind's |
| `Art` | Seeded placeholder "renders" for previews and empty states |
| `toast()` + `Toaster` | `info` · `success` · `warning` · `error`, optional action |
| `EmptyState` | Icon tile + title + one sentence on what will appear + the action that makes it appear; `tone="warning"` when something's wrong (a missing folder) |
| `DropZone` | Drop a file or click to pick one; `compact` once something is loaded, `busy` while reading; `multiple` + `onFiles` takes several (the batch runner) |
| `Veil` | Blurs sensitive content with a "NSFW · Click to reveal" pill; the reveal click never reaches what's underneath; `onReveal` reports it |
| `Carousel` | One large image with previous/next and a thumbnail strip; arrow keys while focused; NSFW images blurred until clicked (and stay revealed while open); videos show their first frame with a badge; `empty` when there are no images |
| `ProgressBar` | Determinate (0–1) or indeterminate (`null`); `accent` / `success` / `danger`; `sm` / `md` |
| `CopyButton` | Icon button that copies text and shows a check for a moment |
| `PropertyList` | Label/value rows for metadata; skips empty values; optional per-row copy and mono |
| `TreeRow` | One file-tree row: indent, chevron for folders, icon, label, unsaved dot, trailing actions on hover |
| `InlineInput` | Borderless input for dense lists (wildcard lines); a field appears on hover and focus; `muted` for comments; `size="lg"` is a title edited in place, as wide as its text (the profile name) |
| `StarRating` | 0–5 stars; click a star (again to clear), arrows and 0–5 keys, a radio group; `sm`; `readOnly` for display |
| `CommandPalette` | A search field over grouped entries (icon or thumbnail, label, muted hint, keys); fuzzy matching (`lib/fuzzy`), ↑/↓, Enter, Esc; an empty query shows a few per group; at most 60 rows |
| `Tour` | Steps that highlight a part of the page (`[data-tour=…]`, `display: contents` wrappers measured by their children) with a card beside it: step dots, Back / Next / Done, Skip; arrows, Enter, Esc |

**Layers** (z-index, highest last): the lightbox 250 · dialogs 300 · the tour 310 · the command palette 320 · popovers and menus 350 · select lists 360 · tooltips 370 · the dev layout switcher 390 (dev mode only) · toasts 400. Anything that floats sits above full-screen surfaces, so a popover opened from the lightbox or a dialog shows.

**Adding a control or variant:** build it in `ui/`, export it from `ui/index.ts`, show every state in the Design Lab (normal, hover, focus, active, disabled, invalid, selected, open) in at least the Blombo and Light themes. It isn't done until it's in the Lab.

## Layout patterns

- **Create-profile wizard:** a bare `Dialog`: a step rail (avatar, name, step n of 4) and a pane with the step title, a close button and a pinned footer. Profile: a 2:3 picture card (click or drop) beside name and color. Folders: One folder for everything (Models, Output and Wildcards inside it, each marked Found or Will be created; profile create makes the missing ones and never touches existing ones) or each folder separately. ComfyUI: Managed install or My own ComfyUI (a folder). Then theme and starter workflows.
- **Profile screen:** only the profile cards, centered: 224×336 (2:3) cards filled with the profile picture (or its monogram), name and image count over a dark scrim at the bottom; on hover the picture zooms in slightly, the border takes the accent and the options button shows (the menu grows out of it); a dashed New profile card; a version button with the GitHub mark in the bottom-right corner (opens the repo). No title, no keyboard hints.
- **App frame:** 56 px header (brand + workflow switcher · centered main tabs · system cluster · avatar), a three-column grid: the tabs stay centered while there's room and are pushed aside, never covered, when the cluster grows (the orange generation-queue chip and the accent downloads chip appear only while busy). No footer.
- **Generate:** models strip → prompts + Generate stack → workspace tabs → params column (layout document) + image stage.
- **Settings:** centered, max 1120 px, left page rail with groups, Overview first.
- **Gallery:** sidebar (248 px: All images, Favorites, This week, libraries with covers and counts, Trash, scan status) + toolbar (search, Model / LoRA / Favorites filters, tile size, justified or grid, sort) + a virtualized list: the showcase hero (home view only: everything, newest first, unfiltered), then day headers and justified rows (the default) or square tiles. Lightbox: the image (click to zoom to 100% and drag to pan), a filmstrip, and a 360 px details sheet with Use these settings, Import workflow, File info, Reveal, Copy, Remove. Keys: ← → browse, F favorite, Z zoom, Delete move to trash, Esc close.
- **File Info:** centered (max 1120 px); a drop zone, then a sticky file card (preview, size, origin) beside readable sections: how it was made, all parameters, the ComfyUI graph, raw chunks; for safetensors: overview, trigger words, training, a tag cloud (size = how often), all metadata with a filter.
- **Models → Local:** search + kind chips with counts + sort + rescan above a virtualized card grid; selecting a card opens a 380 px info sheet (thumbnail, trigger words, file facts, Civitai link, description, files next to it) with Rename, Move, Reveal and File info.
- **Models → Civitai:** a tab strip (Browse + opened models, closable) · the filter bar (a large search field with Search, type chips, base model / sort / period selects, NSFW segmented, saved filters popover, Reset) with recent searches as chips under it · a virtualized ModelCard grid with a stats footer (downloads, likes, creator) and marks, loading the next page near the end.
- **Civitai model page:** centered (max 1180 px), the carousel beside a 400 px column: type, base model and mark badges, the name, creator (click: their models), stats and a civitai.com link; the version select; the download panel (Download with size, the destination path with a pencil to change kind folder and subfolder, "already in your models folder", early-access notes, the files to choose from); trigger words as chips with copy; tags (click: search). The description below.
- **Downloads:** one `DownloadRow` everywhere (thumbnail or kind icon, name, mono destination, a thin progress bar with bytes, speed and time left, the state badge and the actions its state allows). The header's downloads chip opens a 420 px popover of them with "Clear finished" and a link to History.
- **Models → Manager:** a 232 px category sidebar with counts (Everything, Installed, categories) and the catalog's date with refresh · a virtualized list grouped by category: icon tile, name, base, size · folder/file · host, and Installed, progress with cancel, Retry, or Install (disabled with a reason when it can't be placed).
- **History:** centered (max 1120 px), line tabs Downloads (a virtualized list of download rows, "Clear finished" with a confirmation) and Civitai (recent searches as chips, opened models as cards).
- **Wildcard Manager:** file tree (280 px, search, new file and folder, drag onto a folder to move, row menu; each wildcards folder is a top-level row in Settings order, the first with a **Main** badge when there are several; a file a higher folder overrides is dimmed and marked "overridden") · editor (Raw: CodeMirror with folding, lint, `__` completion; Lines: one row per option, YAML keys on the left) · roll preview (320 px).
- **Settings → Civitai:** an account panel (a password field with "Check and save", then "Connected as …" with Replace and Remove), then Browsing, Downloads (folder parts as removable chips in order, naming, an example path, author aliases, parallel downloads, info and preview files), Your models (marks, lookup with "Check new models now") and History limits.
- **Generate → stages:** each stage is a `Collapsible` whose subtitle summarizes the setup ("1.5× → 768×1152 · 4x-UltraSharp · denoise 0.35") or, when something's missing, says what ("Pick a model", "Needs custom nodes"). A custom node notice on a managed slot leads with a primary **Install**; while installing it becomes an `info` notice ("Installing custom nodes · 4 of 7") with the step, a small `ProgressBar`, the tool's last line in mono and **Stop**; a failure turns it `danger` ("Install failed", **Install again**). Inside: `Notice`s with their fix first, then (for ADetailer and ControlNet) `UnitTabs` and the unit's on/off switch, editable name and remove, then the settings, then inherited fields as `InheritRow`s. ControlNet's image sits next to its map (Show map runs the preprocessor), with a compact `DropZone`, From gallery and Last output.
- **Prompt autocomplete:** a CodeMirror tooltip on `surface-3` in the UI font: a 22 px mark (a category dot in palette ink for tags, a star for frequent ones, a thumbnail for LoRAs and trigger words, blurred when NSFW per the profile), the label, and a mono detail on the right (count, "alias →", "trigger · LoRA", base model). Ctrl+Space opens it; Ctrl+↑/↓ changes the weight at the cursor.
- **Layout picker (Generate tab, Customize bar):** a `Select` of Built-in and This profile layouts ("Default" hint on the profile's default), an "edited" badge for unsaved changes or a link mark when the workflow links the layout; the ⋯ menu makes it the profile's default, resets to default, renames or deletes.
- **Settings → Autocomplete:** the on switch, a "Try it" prompt box, sources as switch rows, tag lists as a panel of rows (name, file and count, Bundled / This profile badge, remove, on/off), then "Download a list" (rows: name with the month of its data, a one-line description, size, **Download** or an "Added" badge) and a compact drop zone to add a CSV, insert behavior, and frequent tags: the "Longest tag counted" number (words, 3 by default) above a numbered, scrolling list (tag, uses).
- **Generate → Scripts:** a `Collapsible` (layout feature `scripts`) with an enable switch; its subtitle says the script and how many images it makes, or that it needs a fix. Inside: a `Segmented` (Matrix · XY plot · Thumbnails), then the script's fields (terms one per line; an axis is a `Select` of parameters and prompt search/replace plus a mono values field with a hint on the syntax and an "All N" button for choices; thumbnails pick models from a filtered checkbox list on `bg-sunken` and a count of the picked ones), the grid switch with its words next to it, and one line that says what Generate will queue or what's wrong (`text-warning` with an icon). While a script is on, the Generate button reads **Run script** with the image count.
- **Batch workflow (Generate):** the params column (Generate-only blocks hidden) beside a panel: a header with the workflow's name, a `batch` badge and its description; the workflow's notices (missing custom nodes with **Install**, missing models with **Find in Manager**); `Field` rows for Images (A folder · Files, a `FolderField` or a multiple `DropZone` with **Choose files…**), Output folder and Options (switches with their words next to them, the caption prefix when the workflow writes text); **Run batch** / **Stop the batch**; then the run: a status line with counts, a `ProgressBar`, the output path in mono, and a virtualized list of files on `bg-sunken`, each with a state icon in its ink plus the outputs or the error (never color alone).
- **Workflow switcher footer:** Edit in ComfyUI · Duplicate · Export · Delete (two clicks); import is the icon next to search and the drop target (ComfyUI JSON, PNG, WebP, `.blombo`).
- **ComfyUI's page (blombo-bridge):** the extension's floating bar sits under ComfyUI's menu, centered, in ComfyUI's own CSS variables (it isn't Blombo's page, so it doesn't use Blombo's tokens): "Editing **name** from Blombo", a short note, **Save to Blombo** (primary), Save as copy, Cancel; results come as ComfyUI toasts.
- **Settings → ComfyUI:** which ComfyUI the profile uses (Managed install · My own ComfyUI, a folder with a live check and the "clean managed install is recommended" warning · Address), then the Blombo bridge row (a status badge: Loaded / Not loaded / Out of date / ComfyUI is off, the version, Check again, what to do, and **Install bridge…** for your own ComfyUI or **Restart ComfyUI** for a slot), then the installer: ComfyUI version ("latest" or a release like 0.43.0), slot name (empty by default: the slot is named after the release it installs, shown as the placeholder), PyTorch build, and a step list with a progress bar on the active step and the tools' output under "Show details".
- **Settings → Folders:** three sections (Models, Outputs, Wildcards), each a `SectionTitle`, a hint on what the main folder is for, and an ordered list on `surface` that ends in a "+" row (a dashed plus tile and "Add a models folder"), which adds a blank row with its path field focused. The first row carries a **Main** badge, the others their position; each row has the name and the id as `InlineInput`s (both follow the path until you change them), Make main (crown, wide screens), Move up, Move down and Remove (files stay), and under them the path as a mono `TextField` with Browse inside it: a green outline when the folder exists, red with "This folder doesn't exist." when it doesn't, none while empty. Errors (a duplicate folder or id, a bad id) show under it. Changes are a draft: **Save folders** (disabled while something's invalid; blank rows are dropped) and Undo changes.
- **Settings → Overview:** a slim profile row (the picture as a 48 px circle: click or drop an image to replace it; the name as an `InlineInput size="lg"`: Enter or clicking away saves, Escape cancels; the theme badge, "generating since", and each kind's main folder on one line with "+n" for the others and their paths on hover), then the four headline numbers as one strip (2×2 on narrow screens), a 14-day bar chart (today in full accent, other days at 45%, a tooltip per day) and the four single-hue rank lists (models, LoRAs, wildcards, workflows) two per row. With no runs yet a panel points to Generate. Folders are edited in Settings → Folders.
- **Settings → Shortcuts:** a search field, "N changed from the defaults" and Reset all, a line with a pencil that says how to change a shortcut, then a table per group (column heads Action · Shortcut · Default, hidden on narrow screens): the label (a warning line with an icon when another action has the same keys), the keys as `Kbd`s in a dashed chip with a pencil that records the next combo when clicked (accent fill and "Press keys…" while recording; Backspace for none, Esc cancels), the default in mono (brighter when changed), and a reset icon on changed rows. "In one view" lists fixed keys read-only, with a line saying they can't be changed.
- **Settings → Notifications:** a `Notice` when this window can't show notifications or they're blocked, the on switch, three "when" switches with their words, the "long run" slider, Allow / Send a test.
- **Settings → About:** a centered identity panel (the 64 px logo, the wordmark, a one-line description, the version as a mono accent badge plus a Development badge in dev mode, View on GitHub and Design Lab in dev mode), then "This install" as a `PropertyList` in a panel (version, ComfyUI with a `StatusDot` and its state, where it runs, platform and browser or desktop window, the data folder with copy), then "This profile · name" as three cards (an icon tile, title, one line, the action): Show in Explorer, Export profile, and a compact `DropZone` to import a profile zip. The cards stack on narrow screens.
- **Help:** the settings layout (220 px topic rail with a sliding indicator that follows the section in view) and sections with numbered steps, tips (`info` icon), tables; the prompt guide is a table of syntax / example (`SyntaxText`, the editor's colors without an editor) / meaning; the playground is the real `PromptEditor` with tags as chips (weight > 1 in weight ink on yellow, < 1 muted, ×w in mono), LoRAs, wildcards (found / not in your folder badges), choices and syntax problems.
- **Command palette:** centered at 12vh, 640 px, `surface-3`; groups Go to · Actions · Workflows · Settings · Help · Models · LoRAs; a footer with ↑ ↓ / Enter hints and the count. The header has a search icon button for it.
- **History → Generations:** search, All / Done / Failed segmented, count, Clear (confirmation); rows with a 64 px thumbnail, workflow name, state badge, the group's title, the prompt in `SyntaxText`, a mono line (model, LoRA count, size, seed, duration, it/s with a per-stage tooltip), Run again and a ⋯ menu (new seed, Use these settings).
- **Prompt history:** the clock icon beside a prompt opens a 460 px popover with Recent (search; prompts in `SyntaxText`, "3 min ago · 2 runs", + to add) and Snippets (insert at the cursor, remove on hover, a name field that saves the current prompt).
- **Gallery marks:** the lightbox's details start with a `surface-2` box: Rating (`StarRating`), Tags (chips with × and an add field with suggestions), Albums (a collection picker with checkboxes and "New collection"). Tiles show `★ n` on rated images; the toolbar has Tag and Rating chips and a "Best rated" sort; the sidebar lists collections with covers and counts.
- **Image stage timing:** a finished result's info chip adds "· 7.9 it/s" with a tooltip of time per part; while running, the progress card shows the server's it/s.
- **Drop to reuse:** dragging a file over Generate shows a dashed accent overlay on `bg/80` ("Drop to use this image's settings"), then "Reading the image…".
- **Model pickers:** favorites first (heart on the card), then recently used, then the rest; tiles in the models strip show the model's picture.
- **Empty states:** icon tile + one sentence on what will appear + the action that makes it appear.

## Narrow screens

Below 1024 px (Tailwind's `lg`: phones, tablets, narrow windows) the app switches to a compact
layout. Desktop classes stay as they are; the compact rules are `max-lg:` additions on top, and
`useCompact()` (`lib/hooks`) is for the few switches CSS can't make.

- **Frame:** the header keeps the logo, workflow switcher, ComfyUI status, errors and avatar; the
  search, VRAM and cache buttons hide. The five main views move to a bottom tab bar (`MobileNav`
  in `app/header/Header.tsx`).
- **One column:** views that put things side by side stack them and scroll as a page: Generate
  (prompt, Generate, then the image above the parameters; Customize is desktop-only), the batch
  runner, File Info, the lightbox (details below the image), the Overview grids.
- **Sidebars:** the gallery's sidebar and model details open in a `Sheet` from a button; Settings
  pages and Help topics become a `Select` at the top; the Manager's categories become a search
  field and a `Select`; Wildcards shows the tree, then the open file with a back arrow.
- **Built in:** `Tabs` scroll sideways instead of clipping; menus, popovers and selects never get
  wider than the screen; `Field layout="left"` puts the label above; `PropertyList` shares the
  width between label and value; `Dialog` keeps an 8 px margin.
- **Touch:** controls that appear on hover also get `pointer-coarse:opacity-100`, so a touch
  screen shows them (decorative hover overlays don't). Keyboard hints next to buttons hide.

## Copy

- Sentence case everywhere. Buttons say exactly what happens ("Create profile", "Unload models from VRAM").
- Errors say what went wrong and what to do: "Add your API key in Settings → Civitai."
- Name things the way people see them: *workflow*, *layout*, *profile*, *stage*, never *manifest* or *binding* in the UI (except the Inspector's technical badges).
- Toasts confirm in past tense: "Workflow saved", "Moved "Anime" to trash".

## Accessibility

- Visible focus ring (`focus-ring` utility / global `:focus-visible`) on everything interactive.
- Every icon-only control has a label. Radios, tabs and sliders expose their ARIA roles and values.
- Keyboard: arrows in segmented controls, tabs, menus and selects; Enter/Escape in editable values; app shortcuts from `shared/shortcuts.ts` (Ctrl+1–8 views, Ctrl+Enter generate, Ctrl+K palette, F1 help, R rescan…), rebindable in Settings → Shortcuts. Show keys with `useShortcutLabel()`, never a hardcoded string.
- Contrast, checked by `src/client/styles/contrast.test.ts` for every theme × accent on every surface (`bg` to `field`): `fg`, `fg-2`, `fg-3`, every `-ink` and the syntax colors 4.5:1; `fg-4` 3:1 (hints, counts, disabled); `on-accent` on `accent` 4.5:1 (yellow, green and cyan accents use dark text; orange and pink use a shade deeper than their palette color). A new text token goes into that test. Known exception: white on the Generate orange is about 4.1:1 (3.9:1 in Light); the label is 18 px semibold, so it passes as large text.
- Modal layers that aren't a `Dialog` (the lightbox, the tour) use `useModalFocus(ref)` from `lib/hooks`: focus moves in, Tab stays inside, focus returns on close. A file input is opened from a real `Button` (a `<label>` around a hidden input can't be reached with Tab). A slider without a visible label takes `ariaLabel`.
- Status is never color alone: the header's ComfyUI dot gets a word (Stopped, Starting, Offline…) whenever ComfyUI isn't simply running.
