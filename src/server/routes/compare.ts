import { Hono } from "hono";
import { CompareUpdate, NewCompareBody, StartCompareBody } from "../../shared/compare.ts";
import { readJson } from "../lib/http.ts";
import type { CompareService } from "../services/compare.ts";

/** Compare: the profile's comparisons, making and changing them, starting and stopping them. */
export function compareRoutes(compare: CompareService) {
  const r = new Hono();

  r.get("/", async (c) => c.json(await compare.list()));

  r.post("/", async (c) => c.json(await compare.create(await readJson(c, NewCompareBody)), 201));

  r.patch("/:id", async (c) =>
    c.json(await compare.update(c.req.param("id"), await readJson(c, CompareUpdate))),
  );

  r.delete("/:id", async (c) => {
    await compare.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  r.post("/:id/clone", async (c) => c.json(await compare.clone(c.req.param("id")), 201));

  r.post("/:id/start", async (c) => {
    const { mode } = await readJson(c, StartCompareBody);
    return c.json(await compare.start(c.req.param("id"), mode));
  });

  r.post("/:id/stop", async (c) => {
    await compare.stop(c.req.param("id"));
    return c.json({ ok: true });
  });

  return r;
}
