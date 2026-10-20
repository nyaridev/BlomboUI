import fs from "node:fs/promises";
import { Hono } from "hono";
import { SuggestQuery, TagListName } from "../../shared/autocomplete.ts";
import { HttpError } from "../lib/http.ts";
import type { AutocompleteService } from "../services/autocomplete.ts";
import { revealInFileManager } from "../services/system.ts";

/** Prompt suggestions and the tag lists behind them (Settings → Autocomplete). */
export function autocompleteRoutes(autocomplete: AutocompleteService) {
  const r = new Hono();

  r.get("/", async (c) => {
    const parsed = SuggestQuery.safeParse(c.req.query());
    if (!parsed.success) throw new HttpError(400, "Invalid suggestion query.", "bad_query");
    const { q, mode, limit } = parsed.data;
    return c.json(await autocomplete.suggest(q, mode, limit));
  });

  r.get("/lists", async (c) => c.json(await autocomplete.lists()));

  /** Raw CSV body; the file name comes from ?filename=. */
  r.post("/lists", async (c) => {
    const name = TagListName.safeParse(c.req.query("filename") ?? "");
    if (!name.success) throw new HttpError(400, "Pick a .csv file.", "bad_name");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    return c.json(await autocomplete.addList(name.data, bytes), 201);
  });

  r.delete("/lists/:file", async (c) => {
    const name = TagListName.safeParse(c.req.param("file"));
    if (!name.success) throw new HttpError(400, "Invalid list name.", "bad_name");
    await autocomplete.removeList(name.data);
    return c.body(null, 204);
  });

  r.post("/lists/reveal", async (c) => {
    const dir = autocomplete.tagsDir();
    await fs.mkdir(dir, { recursive: true });
    await revealInFileManager(dir);
    return c.json({ ok: true });
  });

  r.delete("/frequent", (c) => {
    autocomplete.clearFrequent();
    return c.body(null, 204);
  });

  return r;
}
