import { Hono } from "hono";
import { sendFile } from "../lib/send.ts";
import type { ScriptService } from "../services/scripts.ts";

/** Grids that scripts put together (the image stage shows them by this URL). */
export function scriptRoutes(scripts: ScriptService) {
  const r = new Hono();
  r.get("/grids/:id", async (c) =>
    sendFile(scripts.gridFile(c.req.param("id")), { cache: "private, max-age=86400" }),
  );
  return r;
}
