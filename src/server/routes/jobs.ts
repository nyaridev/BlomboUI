import { Hono } from "hono";
import { z } from "zod";
import { GenerateBody } from "../../shared/jobs.ts";
import { readJson } from "../lib/http.ts";
import type { JobQueue } from "../services/jobs.ts";

export function jobRoutes(queue: JobQueue) {
  const r = new Hono();

  r.get("/", (c) => c.json(queue.snapshot()));

  r.post("/", async (c) => {
    const body = await readJson(c, GenerateBody);
    return c.json(await queue.enqueue(body), 201);
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
    const { on } = await readJson(c, z.object({ on: z.boolean() }));
    queue.setLoop(on);
    return c.json(queue.snapshot());
  });

  r.delete("/:id", async (c) => {
    await queue.cancel(c.req.param("id"));
    return c.json(queue.snapshot());
  });

  return r;
}
