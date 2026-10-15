---
description: Client architecture rules (routing, state, data fetching, performance)
paths:
  - "src/client/**/*.ts"
  - "src/client/**/*.tsx"
---

# Client rules

- **Routing** (`app/router.tsx`): `/` profile screen, `/lab` Design Lab, `/p/$profileId` and `/p/$profileId/$view` the app. `Shell` stays mounted for all views of a profile and keeps `generate` and `gallery` alive (hidden) after their first visit. Don't turn those into unmounting routes.
- **Opening a profile** goes through `lib/session.ts` (`openProfileOnce`, `leaveProfile`). Theme and accent follow the profile record (`Shell` applies them); preview-only changes use `useTheme().set` without saving.
- **Server state** lives in TanStack Query. Keys and hooks are in `lib/queries.ts`; mutations invalidate their keys. Don't mirror server data into Zustand.
- **UI state** lives in small Zustand stores per feature. Select the smallest slice (`useValues((s) => s.values[id])`), never the whole store, so one slider only re-renders itself.
- **API calls** go through `lib/api.ts`, which turns failures into `ApiError` with the server's message. Show that message in a toast or inline.
- **Platform hooks** (`lib/platform.ts`): `openWindow`, `notify`. They work in the browser and in the Tauri window. Don't import `@tauri-apps/api` anywhere else.
- **Performance:** virtualize lists that can exceed ~200 items (TanStack Virtual), lazy-load heavy editors, use `content-visibility`/`contain` on long scroll areas, avoid layout reads in render. CodeMirror owns prompt text; don't mirror it into React state on every keystroke elsewhere.
- **Generate screen** is rendered from a layout document (`features/generate/layout`, `shared/layout/schema.ts`). Parameters come from workflow bindings. New controls are control styles, not new JSX in the view.
- **Preview data** (`features/preview/*`) is Phase 0 only. Don't build new features on it; replace it with real queries as services land.
- Client imports: `@client/…` and `@shared/…`, extensionless.
