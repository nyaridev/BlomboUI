---
description: Shared schemas and vocabulary rules (Zod, constants, pure logic)
paths:
  - "src/shared/**/*.ts"
---

# Shared rules

- `src/shared/` is imported by both the server (Node type stripping) and the client (Vite). Keep it **pure**: no Node APIs, no DOM, no React. Relative imports with `.ts`.
- Every shape that crosses the wire or lands on disk has **one** Zod schema here. Export the inferred type next to it (`export type X = z.infer<typeof X>`).
- Persisted formats carry a version (`format: "blombo.workflow/1"`, `"blombo.layout/1"`, `settings.version`, `profile.version`). Changing a persisted shape needs a migration and a test.
- Reading saved data that may be hand-edited or old: `salvage(schema, value)` (`salvage.ts`) keeps every valid value and fixes or defaults only the bad ones. Don't `safeParse` and fall back to all defaults.
- Vocabulary (ports, themes, accents, model kinds, views, roles, stages, control styles) is declared once and imported everywhere. Don't re-declare string unions in features.
- Pure logic here (prompt tokenizer, layout resolution, manifest helpers) gets Vitest tests next to it.
