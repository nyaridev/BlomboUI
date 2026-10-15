import { Hono } from "hono";
import { z } from "zod";
import {
  AddLibraryBody,
  FavoriteBody,
  GalleryQuery,
  ImageIdsBody,
  TrashIdsBody,
} from "../../shared/gallery.ts";
import { HttpError, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { GalleryService } from "../services/gallery/index.ts";
import { revealInFileManager } from "../services/system.ts";

const imageId = (raw: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid image id.", "bad_id");
  return n;
};

export function galleryRoutes(gallery: GalleryService) {
  const r = new Hono();

  r.get("/overview", async (c) => c.json(await gallery.overview()));

  r.get("/images", (c) => {
    const parsed = GalleryQuery.safeParse(c.req.query());
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.", "bad_query");
    return c.json(gallery.query(parsed.data));
  });

  r.get("/facets", (c) => c.json(gallery.facets(c.req.query("library") ?? "all")));

  r.get("/images/:id", async (c) => c.json(await gallery.details(imageId(c.req.param("id")))));

  r.get("/images/:id/file", async (c) => {
    const id = imageId(c.req.param("id"));
    const file = await gallery.filePath(id);
    const download =
      c.req.query("download") === "1" ? (gallery.get(id)?.name ?? undefined) : undefined;
    return sendFile(file, { cache: c.req.query("v") ? IMMUTABLE : "no-cache", download });
  });

  r.get("/thumbs/:id", async (c) =>
    sendFile(await gallery.thumbFile(imageId(c.req.param("id"))), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      type: "image/webp",
    }),
  );

  r.post("/images/:id/reveal", async (c) => {
    await revealInFileManager(await gallery.filePath(imageId(c.req.param("id"))));
    return c.json({ ok: true });
  });

  r.post("/favorite", async (c) => {
    const body = await readJson(c, FavoriteBody);
    gallery.setFavorite(body.ids, body.favorite);
    return c.json({ ok: true });
  });

  r.post("/trash", async (c) => {
    const { ids } = await readJson(c, ImageIdsBody);
    const moved = await gallery.trash(ids);
    return c.json({ moved: moved.length, ids: moved });
  });

  r.get("/trash", (c) => c.json(gallery.trashList()));

  r.get("/trash/:id/thumb", async (c) =>
    sendFile(await gallery.trashThumbFile(c.req.param("id")), {
      cache: "private, max-age=3600",
      type: "image/webp",
    }),
  );

  r.post("/trash/restore", async (c) => {
    const { ids } = await readJson(c, TrashIdsBody);
    return c.json({ restored: await gallery.restore(ids) });
  });

  r.post("/trash/empty", async (c) => {
    const body = await readJson(c, z.object({ ids: z.array(z.string()).max(5000).optional() }));
    return c.json({ deleted: await gallery.emptyTrash(body.ids) });
  });

  r.post("/sync", (c) => {
    gallery.startSync();
    return c.json(gallery.sync);
  });

  r.post("/libraries", async (c) => {
    const body = await readJson(c, AddLibraryBody);
    return c.json(await gallery.addLibrary(body.name, body.path), 201);
  });

  r.patch("/libraries/:id", async (c) => {
    const body = await readJson(c, z.object({ name: AddLibraryBody.shape.name }));
    await gallery.renameLibrary(c.req.param("id"), body.name);
    return c.json({ ok: true });
  });

  r.delete("/libraries/:id", async (c) => {
    await gallery.removeLibrary(c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
