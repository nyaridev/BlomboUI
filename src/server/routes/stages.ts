import { Hono } from "hono";
import { ComfyFileRef } from "../../shared/comfy.ts";
import { CheckStagesBody, GalleryImageBody, PreviewMapBody } from "../../shared/workflow/stages.ts";
import { HttpError, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { StageService } from "../services/stages.ts";

/** Stages: checks before you generate, and the images ControlNet units read. */
export function stageRoutes(stages: StageService) {
  const r = new Hono();

  r.post("/check", async (c) => {
    const body = await readJson(c, CheckStagesBody);
    return c.json(await stages.check(body.workflowId, body.stages));
  });

  /** Raw image body; the original name comes from ?filename=. */
  r.post("/images", async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    return c.json(await stages.addImage(bytes, c.req.query("filename") ?? "image", "upload"), 201);
  });

  r.post("/images/gallery", async (c) => {
    const body = await readJson(c, GalleryImageBody);
    return c.json(await stages.addFromGallery(body.id), 201);
  });

  r.post("/images/output", async (c) => {
    const ref = await readJson(c, ComfyFileRef);
    if (/[\\/]|\.\./.test(ref.filename) || /\.\./.test(ref.subfolder))
      throw new HttpError(400, "Invalid image path.", "bad_ref");
    return c.json(await stages.addFromOutput(ref), 201);
  });

  /** Images are named by their content, so the URL never changes meaning. */
  r.get("/images/:file", async (c) =>
    sendFile(await stages.inputPath(c.req.param("file")), { cache: IMMUTABLE }),
  );

  r.post("/preview", async (c) => {
    const body = await readJson(c, PreviewMapBody);
    return c.json(await stages.previewMap(body.file, body.preprocessor, body.resolution));
  });

  return r;
}
