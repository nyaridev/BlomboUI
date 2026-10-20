---
description: Client architecture rules (routing, state, data fetching, performance)
paths:
  - "src/client/**/*.ts"
  - "src/client/**/*.tsx"
---

# Client rules

- **Routing** (`app/router.tsx`): `/` profile screen, `/lab` Design Lab, `/p/$profileId` and `/p/$profileId/$view` the app. `Shell` stays mounted for all views of a profile and keeps `generate` and `gallery` alive (hidden) after their first visit. Don't turn those into unmounting routes.
- **Opening a profile** goes through `lib/session.ts` (`openProfileOnce`, `leaveProfile`). Theme and accent follow the profile record (`Shell` applies them); preview-only changes use `useTheme().set` without saving.
- **Server state** lives in TanStack Query. Keys and hooks are in `lib/queries.ts`; mutations invalidate their keys. Profile-scoped data (workflows, presets, wildcards) is keyed by the open profile (`useSession`). Don't mirror server data into Zustand.
- **Live state** (ComfyUI status, GPU stats, queue, progress, previews, errors, logs, the download queue and its byte counts, the Civitai lookup) comes from the live bus in `lib/live.ts` (`useLive`). Select single values; use `followTopic()` for topics a view needs only while mounted. No polling.
- **UI state** lives in small Zustand stores per feature. Select the smallest slice (`useValues((s) => s.values[id])`), never the whole store, so one slider only re-renders itself.
- **API calls** go through `lib/api.ts`, which turns failures into `ApiError` with the server's message. Show that message in a toast or inline.
- **Platform hooks** (`lib/platform.ts`): `openWindow`, `prepareWindow` (open inside the click, point it at an address that needs a request first: Edit in ComfyUI), `notify`. They work in the browser and in the Tauri window. Don't import `@tauri-apps/api` anywhere else.
- **Performance:** virtualize lists that can exceed ~200 items (TanStack Virtual), lazy-load heavy editors, use `content-visibility`/`contain` on long scroll areas, avoid layout reads in render. CodeMirror owns prompt text; don't mirror it into React state on every keystroke elsewhere.
- **Generate screen** is rendered from a layout document (`features/generate/layout`, `shared/layout/schema.ts`). Parameters come from workflow bindings. New controls are control styles, not new JSX in the view.
- **Generate values** live in `features/generate/state.ts` (`useValues`), keyed by binding id; `setValue` saves to the workflow in the background. Loading a workflow must never save it: programmatic updates (the prompt editor syncing to a new value) don't report changes. Stage settings live there too (`useStage(key)`, saved by the same PATCH and sent with Generate); stage blocks read what's missing from `useStageReport` (debounced), never by guessing in the UI.
- **Scripts and batch:** the script being edited is UI state (`features/generate/scripts.ts`, `useScript`), planned with the shared planner for the count and errors; Generate sends it as `script`. Batch workflows render `features/generate/batch/BatchView.tsx`; its run comes from the live bus (`useLive((s) => s.batch)`, `followTopic("batch")`). Saves from ComfyUI arrive as `workflow.saved`; `useBridgeToasts` (mounted in Shell) announces them and reloads the open workflow's values.
- **Layouts** come from the server (`useLayouts`, the workflow detail's `layoutDoc`); `features/generate/layouts.ts` links, saves, renames and deletes them. `useLayout` holds only what's on screen, Customize state and undo.
- **Prompt editing:** every prompt box is `PromptEditor` (highlighting, autocomplete and Ctrl+↑/↓ weights from `promptAssist.ts`, settings read through a getter so the editor isn't rebuilt).
- **Settings** come from `useSettings()` and change through `useUpdateSettings()` (partial patch, cache updates at once). Theme and accent stay on the profile record; the UI font and NSFW blur are settings.
- **Gallery** data is profile-scoped TanStack Query (`qk.gallery…`); lists are infinite queries rendered as virtual rows. Live `gallery.*` messages update or invalidate them in `lib/live.ts`; views only `followTopic("gallery")`. When a server change also arrives over the bus, don't rely on `mutate(…, { onSuccess })` for follow-ups (the view can unmount first); move on first and use the `mutateAsync` promise.
- **Preview data** (`features/preview/*`) remains only for the Design Lab's sample prompt. Don't build new features on it.
- **Civitai and downloads:** Civitai data comes from `/api/civitai` (TanStack Query under `["civitai", profileId, …]`); images only through the server's proxy URLs in those answers, never a civitai.com URL in an `<img>`. Downloads are started with `useStartDownload()`; their state is `useLive((s) => s.downloads)` and per-item `s.downloadProgress[id]`. Show a download with `DownloadRow`. Deep links into Models go through `features/models/nav.ts` (`showLocal`, `showManager(category, query)`) and `openCivitaiModel()`.
- Client imports: `@client/…` and `@shared/…`, extensionless.
