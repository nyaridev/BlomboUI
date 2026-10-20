import { Hono } from "hono";
import { StartBatchBody } from "../../shared/batch.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { BatchService } from "../services/batch.ts";

const MAX_UPLOAD = 200 * 1024 * 1024;

/** The batch runner: start, stop, the current state, and staging dropped files. */
export function batchRoutes(batch: BatchService) {
  const r = new Hono();

  r.get("/", (c) => c.json(batch.snapshot()));

  r.get("/check/:workflowId", async (c) => c.json(await batch.check(c.req.param("workflowId"))));

  r.post("/", async (c) => {
    const body = await readJson(c, StartBatchBody);
    return c.json(await batch.start(body), 201);
  });

  r.post("/cancel", async (c) => {
    await batch.cancel();
    return c.json(batch.snapshot());
  });

  r.post("/clear", (c) => {
    batch.clear();
    return c.json(batch.snapshot());
  });

  /** A dropped image (raw body, ?filename=): kept on the server so the batch can read it. */
  r.post("/files", async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    if (bytes.byteLength > MAX_UPLOAD)
      throw new HttpError(413, "That file is too large (200 MB at most).", "too_large");
    return c.json(await batch.stage(bytes, c.req.query("filename") ?? "image.png"), 201);
  });

  return r;
}
