import { Hono } from "hono";
import { ComfyFileRef } from "../../shared/comfy.ts";
import { CheckStagesBody, GalleryImageBody, PreviewMapBody } from "../../shared/workflow/stages.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import { MAX_VIDEO_BYTES, type StageService } from "../services/stages.ts";

/** Stages: checks before you generate, and the images ControlNet units read. */
export function stageRoutes(stages: StageService) {
  const r = new Hono();

  r.post("/check", async (c) => {
    const body = await readJson(c, CheckStagesBody);
    return c.json(await stages.check(body.workflowId, body.stages));
  });

  /** Raw image body; the original name comes from ?filename=. */
  r.post("/images", async (c) => {
    const bytes = await readBody(c, 64 * 1024 * 1024, "Pick an image under 64 MB.");
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

  /** Videos a stage reads (Continue a video): raw MP4 body, the gallery, or ComfyUI's output. */
  r.post("/videos", async (c) => {
    const bytes = await readBody(c, MAX_VIDEO_BYTES, "Pick a video under 512 MB.");
    return c.json(await stages.addVideo(bytes, c.req.query("filename") ?? "video", "upload"), 201);
  });

  r.get("/videos/:file/info", async (c) => c.json(await stages.videoInfo(c.req.param("file"))));

  r.post("/videos/gallery", async (c) => {
    const body = await readJson(c, GalleryImageBody);
    return c.json(await stages.addVideoFromGallery(body.id), 201);
  });

  r.post("/videos/output", async (c) => {
    const ref = await readJson(c, ComfyFileRef);
    if (/[\\/]|\.\./.test(ref.filename) || /\.\./.test(ref.subfolder))
      throw new HttpError(400, "Invalid video path.", "bad_ref");
    return c.json(await stages.addVideoFromOutput(ref), 201);
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
