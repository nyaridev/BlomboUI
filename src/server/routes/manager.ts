import { Hono } from "hono";
import type { ManagerCatalog } from "../services/manager.ts";

/** Models → Manager: the ComfyUI model catalog. Installing goes through /api/downloads. */
export function managerRoutes(catalog: ManagerCatalog) {
  const r = new Hono();
  r.get("/catalog", async (c) => c.json(await catalog.catalog(c.req.query("refresh") === "1")));
  return r;
}
