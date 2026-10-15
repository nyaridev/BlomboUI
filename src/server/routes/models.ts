import { Hono } from "hono";
import { ModelIdBody, MoveModelBody, RenameModelBody } from "../../shared/models.ts";
import { HttpError, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { ModelService } from "../services/models.ts";
import { revealInFileManager } from "../services/system.ts";

/** Local model files (the profile's models root). ComfyUI's own lists are under /api/comfy. */
export function modelRoutes(models: ModelService) {
  const r = new Hono();

  const id = (raw: string | undefined) => {
    if (!raw) throw new HttpError(400, "Which model? Pass ?id=.", "no_id");
    return raw;
  };

  r.get("/local", async (c) => c.json(await models.list(c.req.query("rescan") === "1")));

  r.get("/local/details", async (c) => c.json(await models.details(id(c.req.query("id")))));

  r.get("/thumb", async (c) =>
    sendFile(await models.thumbFile(id(c.req.query("id"))), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      type: "image/webp",
    }),
  );

  r.post("/rename", async (c) => {
    const body = await readJson(c, RenameModelBody);
    return c.json(await models.rename(body.id, body.name));
  });

  r.post("/move", async (c) => {
    const body = await readJson(c, MoveModelBody);
    return c.json(await models.move(body.id, body.folder));
  });

  r.post("/reveal", async (c) => {
    const body = await readJson(c, ModelIdBody);
    await revealInFileManager(await models.filePath(body.id));
    return c.json({ ok: true });
  });

  return r;
}
