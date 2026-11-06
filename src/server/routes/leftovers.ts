import { Hono } from "hono";
import { ClearLeftoversBody } from "../../shared/leftovers.ts";
import { readJson } from "../lib/http.ts";
import type { LeftoverService } from "../services/leftovers.ts";

/** Settings → Leftovers: what's kept for models and wildcards that are gone, and clearing it. */
export function leftoverRoutes(leftovers: LeftoverService) {
  const r = new Hono();
  r.get("/", async (c) => c.json(await leftovers.scan()));
  r.post("/clear", async (c) => {
    const { ids } = await readJson(c, ClearLeftoversBody);
    return c.json(await leftovers.clear(ids));
  });
  return r;
}
