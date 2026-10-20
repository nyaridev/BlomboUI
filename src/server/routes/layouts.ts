import { Hono } from "hono";
import { CreateLayoutBody, RenameLayoutBody, SaveLayoutBody } from "../../shared/layout/schema.ts";
import { readJson } from "../lib/http.ts";
import type { LayoutService } from "../services/layouts.ts";
import type { WorkflowService } from "../services/workflows/store.ts";

/** Generate layouts: built-in ones and the profile's layouts/ folder. */
export function layoutRoutes(layouts: LayoutService, workflows: WorkflowService) {
  const r = new Hono();

  r.get("/", async (c) => c.json(await layouts.list()));

  r.post("/", async (c) => {
    const body = await readJson(c, CreateLayoutBody);
    const doc = await layouts.create(body);
    if (body.linkTo) await workflows.update(body.linkTo, { layout: doc.id });
    return c.json(doc, 201);
  });

  r.put("/:id", async (c) => {
    const body = await readJson(c, SaveLayoutBody);
    return c.json(await layouts.save(c.req.param("id"), body.doc));
  });

  r.patch("/:id", async (c) => {
    const body = await readJson(c, RenameLayoutBody);
    return c.json(await layouts.rename(c.req.param("id"), body.name));
  });

  r.delete("/:id", async (c) => {
    await layouts.remove(c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
