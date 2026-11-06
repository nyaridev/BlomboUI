import { Hono } from "hono";
import {
  ModelFolderBody,
  type ModelHashes,
  ModelIdBody,
  MoveModelBody,
  RenameModelBody,
  RenameModelFolderBody,
  SaveModelInfoBody,
} from "../../shared/models.ts";
import { cleanKey } from "../../shared/scopes.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { ModelLookup } from "../services/lookup.ts";
import type { ModelService } from "../services/models.ts";
import { openInFileManager, revealInFileManager } from "../services/system.ts";

/** Local model files (the profile's models root). ComfyUI's own lists are under /api/comfy. */
export function modelRoutes(models: ModelService, lookup: ModelLookup) {
  const r = new Hono();

  const id = (raw: string | undefined) => {
    if (!raw) throw new HttpError(400, "Which model? Pass ?id=.", "no_id");
    return raw;
  };
  /** Which picture: `?scope=<ids joined by +>`, or none for the global one. */
  const scope = (raw: string | undefined) => {
    const key = cleanKey(raw);
    if (!key)
      throw new HttpError(400, "That isn't a scope picture. Pick the scopes again.", "bad_scope");
    return key;
  };

  r.get("/local", async (c) => {
    const rescan = c.req.query("rescan") === "1";
    // A rescan also refreshes ComfyUI's model lists and matches new files on Civitai.
    return c.json(await models.list(rescan));
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
    sendFile(await models.thumbFile(id(c.req.query("id")), scope(c.req.query("scope"))), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      type: "image/webp",
    }),
  );

  r.get("/picture/raw", async (c) => {
    const { file, type } = await models.rawPicture(
      id(c.req.query("id")),
      scope(c.req.query("scope")),
    );
    return sendFile(file, { cache: c.req.query("v") ? IMMUTABLE : "no-cache", type });
  });

  /** The model info dialog: trigger words, strength and notes (into the A1111 .json). */
  r.patch("/info", async (c) =>
    c.json(await models.saveInfo(await readJson(c, SaveModelInfoBody))),
  );

  /**
   * One of the model's own pictures (global, or `?scope=`): an image in the body replaces it;
   * DELETE moves it to the trash.
   */
  r.put("/picture", async (c) => {
    const target = id(c.req.query("id"));
    const key = scope(c.req.query("scope"));
    const bytes = await readBody(c, 64 * 1024 * 1024, "Pick an image under 64 MB.");
    if (bytes.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    await models.setPicture(target, bytes, key);
    return c.json({ ok: true });
  });
  r.delete("/picture", async (c) => {
    await models.removePicture(id(c.req.query("id")), scope(c.req.query("scope")));
    return c.json({ ok: true });
  });

  /** SHA256 and AutoV2 (hashed now when the background lookup hasn't yet). */
  r.get("/hash", async (c) => {
    const sha256 = await lookup.hashOf(id(c.req.query("id")));
    return c.json({ sha256, autov2: sha256.slice(0, 10) } satisfies ModelHashes);
  });

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

  r.post("/open-folder", async (c) => {
    const body = await readJson(c, ModelFolderBody);
    await openInFileManager(await models.folderPath(body.kind, body.folder, body.root));
    return c.json({ ok: true });
  });

  r.post("/rename-folder", async (c) => {
    const body = await readJson(c, RenameModelFolderBody);
    await models.renameFolder(body.kind, body.folder, body.name, body.root);
    return c.json({ ok: true });
  });

  return r;
}
