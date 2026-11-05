import { Hono } from "hono";
import {
  AddCivitaiImageBody,
  AddLibraryBody,
  CollectionItemsBody,
  CollectionName,
  EmptyTrashBody,
  FavoriteBody,
  GalleryHomeQuery,
  GalleryQuery,
  GalleryUsesQuery,
  ImageIdsBody,
  RatingBody,
  RenameLibraryBody,
  TagsBody,
  TrashIdsBody,
} from "../../shared/gallery.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { AutocompleteService } from "../services/autocomplete.ts";
import { galleryHome, mostUsed } from "../services/gallery/home.ts";
import type { ImportService } from "../services/gallery/imports.ts";
import type { GalleryService } from "../services/gallery/index.ts";
import type { HistoryService } from "../services/history.ts";
import { revealInFileManager } from "../services/system.ts";

const imageId = (raw: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid image id.", "bad_id");
  return n;
};

/** A file added from your PC (videos can be big). */
const MAX_IMPORT = 512 * 1024 * 1024;

export function galleryRoutes(
  gallery: GalleryService,
  others: { history: HistoryService; autocomplete: AutocompleteService; imports: ImportService },
) {
  const r = new Hono();

  /** Add an image from your PC (the file's bytes, its name in ?filename=). */
  r.post("/import", async (c) => {
    const data = await readBody(c, MAX_IMPORT, "That file is too large to add (512 MB max).");
    if (data.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    return c.json(await others.imports.addFile(data, c.req.query("filename") ?? "image"));
  });

  /** Add an image from Civitai (its original file and what Civitai says about it). */
  r.post("/import/civitai", async (c) =>
    c.json(await others.imports.addCivitai(await readJson(c, AddCivitaiImageBody))),
  );

  r.get("/overview", async (c) => c.json(await gallery.overview()));

  r.get("/home", async (c) => {
    const parsed = GalleryHomeQuery.safeParse(c.req.query());
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.", "bad_query");
    return c.json(await galleryHome({ gallery, ...others }, parsed.data.seed));
  });

  r.get("/uses", async (c) => {
    const parsed = GalleryUsesQuery.safeParse(c.req.query());
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.", "bad_query");
    return c.json(await mostUsed({ gallery, ...others }, parsed.data.kind, parsed.data.seed));
  });

  r.get("/images", async (c) => {
    const parsed = GalleryQuery.safeParse(c.req.query());
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query.", "bad_query");
    return c.json(await gallery.query(parsed.data));
  });

  r.get("/facets", async (c) => c.json(await gallery.facets(c.req.query("library") ?? "all")));

  r.get("/images/:id", async (c) => c.json(await gallery.details(imageId(c.req.param("id")))));

  r.get("/images/:id/file", async (c) => {
    const id = imageId(c.req.param("id"));
    const file = await gallery.filePath(id);
    const download =
      c.req.query("download") === "1" ? (gallery.get(id)?.name ?? undefined) : undefined;
    return sendFile(file, {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      download,
      range: c.req.header("range"),
    });
  });

  r.get("/thumbs/:id", async (c) =>
    sendFile(await gallery.thumbFile(imageId(c.req.param("id")), c.req.query("anim") === "1"), {
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

  r.post("/rating", async (c) => {
    const body = await readJson(c, RatingBody);
    gallery.setRating(body.ids, body.rating);
    return c.json({ ok: true });
  });

  r.post("/tags", async (c) => {
    const body = await readJson(c, TagsBody);
    gallery.setTags(body.ids, body.add, body.remove);
    return c.json({ ok: true });
  });

  r.get("/tags", (c) => c.json(gallery.tags()));

  r.get("/collections", (c) => c.json(gallery.collections()));

  r.post("/collections", async (c) => {
    const { name } = await readJson(c, CollectionName);
    return c.json(gallery.createCollection(name), 201);
  });

  r.patch("/collections/:id", async (c) => {
    const { name } = await readJson(c, CollectionName);
    gallery.renameCollection(c.req.param("id"), name);
    return c.json({ ok: true });
  });

  r.delete("/collections/:id", (c) => {
    gallery.removeCollection(c.req.param("id"));
    return c.body(null, 204);
  });

  r.post("/collections/:id/items", async (c) => {
    const body = await readJson(c, CollectionItemsBody);
    return c.json({
      changed: gallery.setCollectionItems(c.req.param("id"), body.ids, body.remove),
    });
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
    const body = await readJson(c, EmptyTrashBody);
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
    const body = await readJson(c, RenameLibraryBody);
    await gallery.renameLibrary(c.req.param("id"), body.name);
    return c.json({ ok: true });
  });

  r.delete("/libraries/:id", async (c) => {
    await gallery.removeLibrary(c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
