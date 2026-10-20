import { Hono } from "hono";
import { GenerateBody, LoopBody } from "../../shared/jobs.ts";
import { readJson } from "../lib/http.ts";
import type { JobQueue } from "../services/jobs.ts";
import type { ScriptService } from "../services/scripts.ts";

export function jobRoutes(queue: JobQueue, scripts: ScriptService) {
  const r = new Hono();

  r.get("/", (c) => c.json(queue.snapshot()));

  r.post("/", async (c) => {
    const body = await readJson(c, GenerateBody);
    return c.json(await (body.script ? scripts.run(body) : queue.enqueue(body)), 201);
  });

  r.post("/interrupt", async (c) => {
    await queue.interrupt();
    return c.json(queue.snapshot());
  });

  r.post("/cancel", async (c) => {
    await queue.cancelAll();
    return c.json(queue.snapshot());
  });

  r.put("/loop", async (c) => {
    const { on } = await readJson(c, LoopBody);
    queue.setLoop(on);
    return c.json(queue.snapshot());
  });

  /** Stop a script's or a batch's runs (queued ones dropped, the running one interrupted). */
  r.post("/groups/:id/cancel", async (c) => {
    await queue.cancelGroup(c.req.param("id"));
    return c.json(queue.snapshot());
  });

  r.delete("/:id", async (c) => {
    await queue.cancel(c.req.param("id"));
    return c.json(queue.snapshot());
  });

  return r;
}
