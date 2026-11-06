import { Hono } from "hono";
import { HttpError } from "../lib/http.ts";
import type { DevInfoService } from "../services/devinfo.ts";

/** The dev-only Data page (registered in dev mode only): storage and one image's metadata. */
export function devRoutes(dev: DevInfoService) {
  const r = new Hono();

  r.get("/storage", async (c) => c.json(await dev.storage()));

  r.get("/images/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Bad image id.", "bad_id");
    return c.json(await dev.image(id));
  });

  return r;
}
