# ADR-0007: Hand-built controls on tokens, Floating UI for behavior, custom SVG icons

**Status:** Accepted (built in Phase 0; text contrast is tested per theme and accent since the final pass)
**Date:** 2026-10-15
**Deciders:** nyaridev

## Context

Wrapping a component library with custom CSS tends to drift: each view restyles controls a little differently, and generic icon sets force guesses (a download arrow for "unload models", a database for "free cache"). The user wants:

- one unified styling system and primitives, keeping the current palette (it can be tweaked)
- every control built visually from scratch, as in Game Forge, so behavior can be controlled "to the bone", with no shadcn feel
- custom SVG icons that are easy to modify

## Decision

- **Tokens**: CSS custom properties in `client/styles/tokens.css`. They are exposed to Tailwind 4 through `@theme inline`. Components never contain raw hex values. Themes (`blombo`, `slate`, `midnight`, `ember`, `moss`, `light`) override tokens, and the profile accent overrides `--accent*`.
- **Controls** in `client/ui/` are written by hand. Each one owns its markup, states (hover, focus-visible, active, disabled, invalid, selected) and motion:
  - Native elements where they're enough: `button`, `input`, `textarea`. Pointer capture powers sliders and drag-scrub numbers.
  - **Floating UI** (`@floating-ui/react`) for anything that floats: Popover, Menu, Select, Combobox, Tooltip, ContextMenu, Dialog. It brings positioning, dismissal, focus management, list navigation and typeahead without any visual opinion.
  - **Motion** springs (`snappy`, `bouncy`, `glide`) for thumbs, indicators, presence and layout.
- **Icons**: `client/icons/` holds hand-drawn 24×24 SVG paths with a 1.75 stroke, `currentColor` and round caps. There is one `<Icon name>` component and a registry, and every icon appears in the Design Lab. Icons are named for the action, not the shape (`unload-models`, `free-cache`, `rescan-models`).
- **Design Lab** (`/lab`, dev only and from Settings → About) renders every token, icon and control in every state and theme. A control is unfinished until it's in the Lab.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Radix + custom styles | Accessible behavior | Radix DOM shapes leak into styling; `asChild` gymnastics |
| React Aria Components | Best-in-class a11y | Heavy; its own state model fights fine-grained motion |
| **Floating UI + native + own code (chosen)** | Full control of DOM and motion, small | We own keyboard and a11y details, so they need tests |
| shadcn/ui | Fast start | Exactly the look the user wants to avoid |

## Consequences

- Each control gets a Vitest + Testing Library spec for keyboard and ARIA basics.
- Visual changes happen in one place, and the Lab shows them all.
- Revisit: if a11y gaps show up in Select or Combobox, swap in React Aria hooks underneath without changing visuals.
