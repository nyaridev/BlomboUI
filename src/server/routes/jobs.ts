import { Hono } from "hono";
import { GenerateBody, LoopBody, QueueOrderBody } from "../../shared/jobs.ts";
import { readJson } from "../lib/http.ts";
import type { JobQueue } from "../services/jobs.ts";
import type { LongVideoService } from "../services/longvideo.ts";
import type { ScriptService } from "../services/scripts.ts";

export function jobRoutes(queue: JobQueue, scripts: ScriptService, longVideo: LongVideoService) {
  const r = new Hono();

  r.get("/", (c) => c.json(queue.snapshot()));

  r.post("/", async (c) => {
    const body = await readJson(c, GenerateBody);
    // A swap runs in parts when its window of the video is longer than one run makes, or when
    // Long video's Parts repeat its Length.
    const parts = await longVideo.split(body);
    if (parts) return c.json(parts, 201);
    if (body.script?.kind === "long") return c.json(await longVideo.run(body), 201);
    if (body.script) return c.json(await scripts.run(body), 201);
    const res = await queue.enqueue(body);
    // A click that makes several images gets a batch grid (not Generate forever's endless runs).
    if (!body.loop) scripts.followClick(res.jobs);
    return c.json(res, 201);
  });

  r.post("/interrupt", async (c) => {
    await queue.interrupt();
    return c.json(queue.snapshot());
  });

  r.post("/cancel", async (c) => {
    await queue.cancelAll();
    return c.json(queue.snapshot());
  });

  r.put("/order", async (c) => {
    const { ids } = await readJson(c, QueueOrderBody);
    queue.reorder(ids);
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
