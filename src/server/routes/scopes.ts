import fs from "node:fs/promises";
import { Hono } from "hono";
import {
  SaveScopeBody,
  ScopeSettingsBody,
  ScopeThumbFromImageBody,
  ScopeThumbTarget,
} from "../../shared/scopes.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { GalleryService } from "../services/gallery/index.ts";
import type { ScopeService } from "../services/scopes.ts";

const MAX_UPLOAD = 25 * 1024 * 1024;

/** Scopes: the list, its options, and each scope's model pictures. */
export function scopeRoutes(scopes: ScopeService, gallery: GalleryService) {
  const r = new Hono();

  r.get("/", async (c) => c.json(await scopes.state()));

  r.put("/options", async (c) =>
    c.json(await scopes.setOptions(await readJson(c, ScopeSettingsBody))),
  );

  r.post("/", async (c) => c.json(await scopes.create(await readJson(c, SaveScopeBody)), 201));

  r.patch("/:id", async (c) =>
    c.json(await scopes.update(c.req.param("id"), await readJson(c, SaveScopeBody))),
  );

  r.delete("/:id", async (c) => {
    await scopes.remove(c.req.param("id"));
    return c.body(null, 204);
  });

  r.get("/thumb", async (c) => {
    const scope = c.req.query("scope");
    const key = c.req.query("key");
    if (!scope || !key) throw new HttpError(400, "Which picture? Pass scope and key.", "no_key");
    return sendFile(await scopes.thumbFile(scope, key), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      type: "image/webp",
    });
  });

  /** Upload a picture for a model (the body is the image; kind and name in the query). */
  r.put("/:id/thumbs", async (c) => {
    const target = ScopeThumbTarget.safeParse({
      kind: c.req.query("kind"),
      name: c.req.query("name"),
    });
    if (!target.success) throw new HttpError(400, "Which model? Pass kind and name.", "no_model");
    const data = await readBody(c, MAX_UPLOAD, "Pick an image under 25 MB.");
    if (data.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    await scopes.setThumb(
      c.req.param("id"),
      target.data.kind,
      target.data.name,
      new Uint8Array(data),
    );
    return c.json({ ok: true });
  });

  /** Make a model's picture from a gallery image. */
  r.post("/:id/thumbs/from-image", async (c) => {
    const body = await readJson(c, ScopeThumbFromImageBody);
    const bytes = new Uint8Array(await fs.readFile(await gallery.filePath(body.imageId)));
    await scopes.setThumb(c.req.param("id"), body.kind, body.name, bytes);
    return c.json({ ok: true });
  });

  r.post("/:id/thumbs/remove", async (c) => {
    const body = await readJson(c, ScopeThumbTarget);
    await scopes.removeThumb(c.req.param("id"), body.kind, body.name);
    return c.json({ ok: true });
  });

  return r;
}
