import { Hono } from "hono";
import { HttpError } from "../lib/http.ts";
import { inspectBytes, inspectPath } from "../services/fileinfo.ts";
import type { GalleryService } from "../services/gallery/index.ts";
import type { ModelService } from "../services/models.ts";

/** Images are small enough to upload; for safetensors the browser sends only the header. */
const MAX_UPLOAD = 200 * 1024 * 1024;

export function fileInfoRoutes(gallery: GalleryService, models: ModelService) {
  const r = new Hono();

  r.post("/", async (c) => {
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    if (data.byteLength > MAX_UPLOAD)
      throw new HttpError(413, "That file is too large to inspect here (200 MB max).", "too_large");
    return c.json(await inspectBytes(data, c.req.query("filename") ?? "file"));
  });

  r.get("/gallery/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new HttpError(400, "Invalid image id.", "bad_id");
    return c.json(
      await inspectPath(await gallery.filePath(id), { type: "gallery", id: String(id) }),
    );
  });

  r.get("/model", async (c) => {
    const id = c.req.query("id");
    if (!id) throw new HttpError(400, "Which model? Pass ?id=.", "no_id");
    return c.json(await inspectPath(await models.filePath(id), { type: "model", id }));
  });

  return r;
}
