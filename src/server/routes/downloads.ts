import { Hono } from "hono";
import { EnqueueBody } from "../../shared/downloads.ts";
import { readJson } from "../lib/http.ts";
import type { DownloadQueue } from "../services/downloads.ts";
import { revealInFileManager } from "../services/system.ts";

/** The download queue (progress comes over the live bus, `downloads` topic) and its history. */
export function downloadRoutes(downloads: DownloadQueue) {
  const r = new Hono();

  r.get("/", (c) => c.json(downloads.snapshot()));

  /** Where a download would land, before it starts. */
  r.post("/plan", async (c) => c.json(await downloads.plan(await readJson(c, EnqueueBody))));

  r.post("/", async (c) => c.json(await downloads.enqueue(await readJson(c, EnqueueBody)), 201));

  r.post("/clear", (c) => c.json(downloads.clearFinished()));

  r.get("/history", (c) => {
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);
    const limit = Math.min(500, Math.max(1, Number(c.req.query("limit")) || 100));
    return c.json(downloads.history(offset, limit));
  });

  r.delete("/history", (c) => {
    downloads.clearHistory();
    return c.json({ ok: true });
  });

  r.post("/:id/pause", (c) => c.json(downloads.pause(c.req.param("id"))));
  r.post("/:id/resume", async (c) => c.json(await downloads.resume(c.req.param("id"))));
  r.post("/:id/cancel", async (c) => c.json(await downloads.cancel(c.req.param("id"))));

  r.post("/:id/reveal", async (c) => {
    await revealInFileManager(await downloads.revealTarget(c.req.param("id")));
    return c.json({ ok: true });
  });

  return r;
}
