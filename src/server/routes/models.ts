import { Hono } from "hono";
import { ModelIdBody, MoveModelBody, RenameModelBody } from "../../shared/models.ts";
import { HttpError, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { ModelLookup } from "../services/lookup.ts";
import type { ModelService } from "../services/models.ts";
import { revealInFileManager } from "../services/system.ts";

/** Local model files (the profile's models root). ComfyUI's own lists are under /api/comfy. */
export function modelRoutes(models: ModelService, lookup: ModelLookup) {
  const r = new Hono();

  const id = (raw: string | undefined) => {
    if (!raw) throw new HttpError(400, "Which model? Pass ?id=.", "no_id");
    return raw;
  };

  r.get("/local", async (c) => {
    const rescan = c.req.query("rescan") === "1";
    const list = await models.list(rescan);
    // A rescan may find new files to match on Civitai.
    if (rescan) lookup.start();
    return c.json(list);
  });

  /** Background hashing and Civitai matching (progress also comes as `models.lookup`). */
  r.get("/lookup", (c) => c.json(lookup.state()));
  r.post("/lookup", (c) => {
    lookup.start();
    return c.json(lookup.state());
  });
  r.post("/lookup/stop", (c) => {
    lookup.stop();
    return c.json(lookup.state());
  });

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
