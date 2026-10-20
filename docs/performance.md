# Performance

Measured in the final pass (2026-10-20) on the owner's Windows 11 machine, Node 25.5, a throwaway
`--data` / `--runtime` folder, no ComfyUI running. Re-run the server side with:

```bash
node --expose-gc tools/bench-gallery.ts --images 20000
```

It makes 20,000 small ComfyUI-style PNGs (64–108 px, each with an API prompt graph in a `tEXt`
chunk, spread over 60 days of folders) in `runtime/bench-gallery/`, opens a fresh profile on them
and measures through the real routes in-process. `--keep` leaves the folder so a dev instance can
open the same gallery (`node src/server/main.ts --dev --port 4391 --data runtime/bench-gallery/data
--runtime runtime/bench-gallery/runtime`). The tool only clears a folder it made itself.

## Gallery, 20,000 images (server)

| | Before the final pass | Now |
|---|---|---|
| First index | 16.5 s (1,213 files/s) | **5.2 s (3,864 files/s)** |
| Resync, nothing changed | 842 ms | **203 ms** |
| Event loop delay while indexing (p99 / max) | 18 / 72 ms | 22 / 62 ms |
| Other requests while indexing (p95 / max) | 0.3 / 0.8 ms | 0.3 / 0.6 ms |
| First page (300, newest) | 1.5 ms | 2.3 ms |
| Deep page (offset 19,000) | 16 ms | 20 ms |
| Sort by name | 28 ms | **1.8 ms** |
| Search, one word (FTS5 trigram, 1,278 hits) | 9.4 ms | 11 ms |
| Search, two words (1,311 hits) | 8.2 ms | 9.7 ms |
| Search, rare words (37 hits) | 2.1 ms | 2.6 ms |
| Search, 2-letter term (LIKE fallback) | 17 ms | 19 ms |
| Model filter (3,330 hits) | — | 16 ms |
| Overview / facets | 1.3 / 0.6 ms | 1.4 / 0.8 ms |
| Thumbnails, cold: 120 at 12 in parallel | 219 ms (20 ms each) | 204 ms (19 ms each) |
| Thumbnails, cached | 47 ms (4.2 ms each) | 48 ms (4.2 ms each) |
| Server RSS after indexing | 260 MB | 266 MB (heap 26 MB after GC) |
| Profile database | 39 MB | 40 MB |

Medians of 15 requests (p95 within a few ms). What changed: the indexer stats files and reads their
headers a batch of 100 at a time in parallel (it was waiting on one file at a time and spent 54% of
the time idle) and reuses prepared statements; migration 5 adds an index for sorting by name.

## Gallery, 20,000 images (browser)

Dev build, in-app browser, 1440×900, 1,500 scripted scroll steps of 900 px (487,000 px, about 19,000
images loaded through infinite pages):

- No long tasks (over 50 ms) on the main thread; a scroll step's work: median 5 ms, p95 17 ms, max 39 ms.
- At most 1,410 DOM nodes and 80 `<img>` elements at once (virtual rows).
- JS heap 65 MB at the end.

Typing in the gallery search no longer re-renders the grid (it's memoized), and prompt keystrokes no
longer re-render the Shell, Generate and the gallery (the scope follower is its own component).

Frame timing couldn't be measured: the browser pane was hidden, which throttles animation frames.

## Startup bundle

Production build (`vite build`), JavaScript the first screen (the profile screen) loads:

| | Before | Now |
|---|---|---|
| Files | 17 | 5 |
| Size | 1,451 kB (459 kB gzip) | **754 KiB (236 KiB gzip)** |
| CSS | 86 kB (15 kB gzip) | 84 KiB (14 KiB gzip) |

The app Shell (Generate, Gallery, the CodeMirror prompt editor, 144 KiB plus CodeMirror's 336 KiB
chunk) is its own chunk, preloaded when the profile screen is idle, so opening a profile doesn't wait
for it. Total JavaScript: 1.8 MB, mostly lazy views (Wildcards with the YAML editor, Settings,
Models, the Design Lab).

dnd-kit loads only with Customize mode: the params column renders plain wrappers and swaps in
the sortable ones from a lazy chunk (`SortableParams`, 47 kB, 16 kB gzip), which took it out of
the chunk Generate loads (167 kB → 121 kB).
