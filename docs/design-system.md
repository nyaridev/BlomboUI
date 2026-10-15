# Design system

How BlomboUI looks, moves and reads. The Design Lab (`/lab`, or avatar menu → Design Lab) shows everything on this page live, in every theme and accent. Decisions are recorded in [ADR-0007](adr/0007-design-system.md).

## Direction

A dark, calm, precise workspace for making images. The images are the color; the UI stays out of their way.

- **Deep blue-black surfaces**, one blue accent (the profile can change it), and **orange reserved for Generate**.
- **Hand-built controls.** No component-library look. Every control is drawn here and behaves the same everywhere.
- **Quick, physical motion.** Springs, not easing curves. Things respond at once and settle without wobbling.
- **Dense but breathable.** 13 px UI text, 8 px grid, generous gaps between groups and tight gaps inside them.
- **No glassmorphism, no gradients-as-decoration, no emoji icons.** The two gradients we use are functional: the Generate button and the avatar monogram.

## Tokens

All raw colors live in `src/client/styles/tokens.css`. Tailwind sees only tokens: the default palette is cleared in `styles/index.css`, so `bg-red-500` doesn't exist.

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `bg` → `surface` → `surface-2` → `surface-3` | App → panels → cards → floating (menus, popovers) |
| Inputs | `field`, `field-hover`, `sunken` | Inputs sit on `field`; tracks and wells use `sunken` |
| Lines | `line`, `line-strong` | Borders; `line-strong` for hover and floating edges |
| Text | `fg` → `fg-2` → `fg-3` → `fg-4` | Body → labels → muted → hints and disabled |
| Brand | `accent`, `accent-ink`, `on-accent` | Fills use `accent`; text and icons on dark use `accent-ink` |
| Generate | `generate`, `generate-hi`, `generate-ink` | Only the Generate action, its progress and its queue |
| Palette | `red`…`pink` + `-ink` | Model-kind colors, tags, charts. `-ink` for text |
| Status | `success`, `warning`, `danger`, `info` | Always with an icon or a word, never color alone |
| Syntax | `syn-weight`, `syn-lora`, `syn-wildcard`, `syn-break`, `syn-escape`, `syn-invalid` | Prompt editor and the prompt guide |

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

- Radius: `xs` 4 (badges, kbd) · `sm` 6 (small controls) · `md` 8 (controls) · `lg` 12 (cards) · `xl` 16 (dialogs, stage) · `2xl` 22 (hero).
- Control heights: `sm` 28 · `md` 32 · `lg` 40. A toolbar row uses one height.
- Gaps: 4–6 inside a control group, 8–12 between controls in a card, 12–16 between cards, 24–40 between page sections.
- `card` utility: border + hairline top highlight + `radius-lg`. Use it for *objects* (a model, a stage, a stat), not for every block.

## Motion

Presets in `src/client/lib/motion.ts`:

| Preset | Feel | Use |
|---|---|---|
| `snappy` | stiff spring, no overshoot | Thumbs, tab and segment indicators, toggles, menus |
| `bouncy` | small overshoot | Arrivals that deserve life: toasts, the Generate button press |
| `glide` | soft, heavier | Large surfaces: views, the profile-open morph, collapsibles |

- Keep most motion at 120–350 ms. Never animate layout while the user is typing or dragging a value.
- Shared-element morphs use `layoutId` (profile avatar → header avatar).
- Lists enter with a 40–70 ms stagger, once. No looping ambient animation except progress.
- `MotionConfig reducedMotion="user"` honors the OS setting. CSS transitions collapse under `prefers-reduced-motion`.

## Icons

`src/client/icons/paths.ts`: hand-drawn, 24×24 grid, 1.75 stroke, round caps and joins, `currentColor`. One `<Icon name size>` component renders them.

- **Name by action**: `unload-models`, `free-cache`, `rescan-models`, not `chip-arrow` or `broom`.
- Sizes: 14 in dense rows, 15–16 in buttons, 18–22 in empty states and tiles.
- Icon-only buttons always go through `IconButton`, which requires a `label` (tooltip + accessible name) and can show a shortcut.
- To add an icon: draw it on the 24 grid, paste the inner markup into `ICONS`, check it in the Lab next to its neighbors at 16 and 22 px.

## Components (`src/client/ui`)

| Component | Notes |
|---|---|
| `Button` | `primary` · `secondary` · `outline` · `ghost` · `danger`; sizes `sm/md/lg`; `icon`, `iconRight`, `loading` |
| `IconButton` | Required `label`; `shortcut`; `active`; `badge` slot (`CountBubble`) |
| `TextField`, `TextArea`, `Field` | `Field` adds label, hint, error; `layout="left"` for settings rows |
| `NumberField` | Drag the field to scrub (Shift = fine), click to type, wheel while focused, steppers |
| `Slider` | Track + thumb; value in the label row is click-to-type; double-click resets; `marks`; `tone="generate"` |
| `ScrubField` | Field-sized bar; drag anywhere, click to type. Best in dense layouts |
| `Select` | Custom listbox: groups, icons, hints, typeahead |
| `Switch`, `Checkbox`, `Segmented`, `Chip` | `Segmented` has a sliding thumb and arrow-key navigation |
| `Tabs` | `pill` (header) and `line` (panels), sliding indicator |
| `Tooltip`, `Popover`, `Menu`, `Dialog` | Floating UI behavior; `Menu` has typeahead and arrow keys |
| `Collapsible`, `InheritRow` | The stage pattern: header with summary + enable switch; inherited fields show the base value with a link toggle |
| `Badge`, `Kbd`, `StatusDot`, `Spinner`, `Skeleton`, `Meter`, `StageProgress` | Feedback |
| `Avatar` | Image or monogram on the profile accent, with an accent ring |
| `ModelCard`, `FallbackFace` | The one model card; designed fallback when there's no thumbnail. `nsfw` + `blurNsfw` blur the thumbnail until clicked (the first click only reveals); `meta` adds a small mono line (size) |
| `Art` | Seeded placeholder "renders" for previews and empty states |
| `toast()` + `Toaster` | `info` · `success` · `warning` · `error`, optional action |
| `EmptyState` | Icon tile + title + one sentence on what will appear + the action that makes it appear; `tone="warning"` when something's wrong (a missing folder) |
| `DropZone` | Drop a file or click to pick one; `compact` once something is loaded, `busy` while reading |
| `Veil` | Blurs sensitive content with a "NSFW · Click to reveal" pill; the reveal click never reaches what's underneath |
| `ProgressBar` | Determinate (0–1) or indeterminate (`null`); `accent` / `success` / `danger`; `sm` / `md` |
| `CopyButton` | Icon button that copies text and shows a check for a moment |
| `PropertyList` | Label/value rows for metadata; skips empty values; optional per-row copy and mono |
| `TreeRow` | One file-tree row: indent, chevron for folders, icon, label, unsaved dot, trailing actions on hover |
| `InlineInput` | Borderless input for dense lists (wildcard lines); a field appears on hover and focus; `muted` for comments |

**Adding a control or variant:** build it in `ui/`, export it from `ui/index.ts`, show every state in the Design Lab (normal, hover, focus, active, disabled, invalid, selected, open) in at least the Blombo and Light themes. It isn't done until it's in the Lab.

## Layout patterns

- **App frame:** 56 px header (brand + workflow switcher · centered main tabs · system cluster · avatar). No footer.
- **Generate:** models strip → prompts + Generate stack → workspace tabs → params column (layout document) + image stage.
- **Settings:** centered, max 1120 px, left page rail with groups, Overview first.
- **Gallery:** sidebar (248 px: All images, Favorites, This week, libraries with covers and counts, Trash, scan status) + toolbar (search, Model / LoRA / Favorites filters, tile size, justified or grid, sort) + a virtualized list: the showcase hero (home view only: everything, newest first, unfiltered), then day headers and justified rows (the default) or square tiles. Lightbox: the image (click to zoom to 100% and drag to pan), a filmstrip, and a 360 px details sheet with Use these settings, Import workflow, File info, Reveal, Copy, Remove. Keys: ← → browse, F favorite, Z zoom, Delete move to trash, Esc close.
- **File Info:** centered (max 1120 px); a drop zone, then a sticky file card (preview, size, origin) beside readable sections: how it was made, all parameters, the ComfyUI graph, raw chunks; for safetensors: overview, trigger words, training, a tag cloud (size = how often), all metadata with a filter.
- **Models → Local:** search + kind chips with counts + sort + rescan above a virtualized card grid; selecting a card opens a 380 px info sheet (thumbnail, trigger words, file facts, Civitai link, description, files next to it) with Rename, Move, Reveal and File info.
- **Wildcard Manager:** file tree (280 px, search, new file and folder, drag onto a folder to move, row menu) · editor (Raw: CodeMirror with folding, lint, `__` completion; Lines: one row per option, YAML keys on the left) · roll preview (320 px).
- **Settings → ComfyUI:** which ComfyUI the profile uses, then the installer: slot, PyTorch build, version, and a step list with a progress bar on the active step and the tools' output under "Show details".
- **Empty states:** icon tile + one sentence on what will appear + the action that makes it appear.

## Copy

- Sentence case everywhere. Buttons say exactly what happens ("Create profile", "Unload models from VRAM").
- Errors say what went wrong and what to do: "Add your API key in Settings → Civitai."
- Name things the way people see them: *workflow*, *layout*, *profile*, *stage*, never *manifest* or *binding* in the UI (except the Inspector's technical badges).
- Toasts confirm in past tense: "Workflow saved", "Moved "Anime" to trash".

## Accessibility

- Visible focus ring (`focus-ring` utility / global `:focus-visible`) on everything interactive.
- Every icon-only control has a label. Radios, tabs and sliders expose their ARIA roles and values.
- Keyboard: arrows in segmented controls, tabs, menus and selects; Enter/Escape in editable values; `1`–`9` on the profile screen; `Ctrl+Enter` to generate.
- Contrast: text tokens on their surfaces meet WCAG AA in every theme; check new tokens in the Lab against `surface` and `surface-2`.
