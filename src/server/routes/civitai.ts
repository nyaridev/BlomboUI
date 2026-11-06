import { Hono } from "hono";
import { ZodError } from "zod";
import {
  CivitaiUsername,
  CommunityQuery,
  fromBase64Url,
  OpenCivitaiPageBody,
  parseBrowseQuery,
  parseFeedUsers,
  SetCivitaiKeyBody,
} from "../../shared/civitai.ts";
import { HttpError, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { CivitaiService } from "../services/civitai/index.ts";

/**
 * Civitai through the server: the account (the key is write-only), browsing, model pages, the
 * image proxy and the browse/search history. The client never calls Civitai itself.
 */
export function civitaiRoutes(civitai: CivitaiService) {
  const r = new Hono();

  r.get("/account", async (c) => c.json(await civitai.account()));

  r.put("/account/key", async (c) => {
    const body = await readJson(c, SetCivitaiKeyBody);
    return c.json(await civitai.setKey(body.key, body.check));
  });

  r.delete("/account/key", async (c) => c.json(await civitai.removeKey()));

  r.post("/open-page", async (c) => {
    const { url } = await readJson(c, OpenCivitaiPageBody);
    await civitai.openPage(url);
    return c.json({ ok: true });
  });

  const browse = (query: Record<string, string | undefined>) => {
    try {
      return parseBrowseQuery(query);
    } catch (error) {
      const issue = error instanceof ZodError ? error.issues[0] : undefined;
      throw new HttpError(
        400,
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid filter.",
        "bad_filter",
      );
    }
  };

  r.get("/models", async (c) => {
    const parsed = browse(c.req.query());
    return c.json(await civitai.search(parsed.filter, parsed.cursor));
  });

  /** The Following feed: ?users=a,b plus the browse filter. */
  r.get("/feed", async (c) => {
    const users = parseFeedUsers(c.req.query("users"));
    if (!users.length)
      throw new HttpError(400, "Whose models? Pass ?users= with Civitai usernames.", "no_users");
    return c.json(await civitai.feed(users, browse(c.req.query()).filter));
  });

  /** Look a creator up (name as Civitai spells it, picture); a followed one's entry is updated. */
  r.post("/creators/:username/lookup", async (c) => {
    const name = CivitaiUsername.safeParse(c.req.param("username"));
    if (!name.success) throw new HttpError(400, "That isn't a Civitai username.", "bad_username");
    return c.json(await civitai.refreshCreator(name.data));
  });

  r.get("/models/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid model id.", "bad_id");
    return c.json(await civitai.model(id));
  });

  r.get("/versions/:id/images", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid version id.", "bad_id");
    return c.json(await civitai.versionImages(id));
  });

  r.get("/versions/:id/community", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid version id.", "bad_id");
    const query = CommunityQuery.safeParse(c.req.query());
    if (!query.success)
      throw new HttpError(400, "Pick a sort, a period and a cursor Civitai gave.", "bad_query");
    return c.json(await civitai.communityImages(id, query.data));
  });

  /** SHA256, AutoV2 (10), AutoV3 (12) or AutoV1 (8 hex characters). */
  r.get("/by-hash/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!/^[0-9a-fA-F]{8,64}$/.test(hash))
      throw new HttpError(400, "Pass a file hash: 8 to 64 hex characters.", "bad_hash");
    return c.json(await civitai.byHash(hash.toUpperCase()));
  });

  r.get("/image", async (c) => {
    const url = fromBase64Url(c.req.query("u") ?? "");
    if (!url) throw new HttpError(400, "Which image? Pass ?u=.", "no_image");
    const { file, type } = await civitai.images.get(url);
    return sendFile(file, { type, cache: IMMUTABLE });
  });

  r.get("/history/views", (c) => c.json(civitai.views()));
  r.delete("/history/views", (c) => {
    civitai.clearViews();
    return c.json({ ok: true });
  });

  r.delete("/history/views/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new HttpError(400, "That isn't a Civitai model id.", "bad_id");
    civitai.forgetView(id);
    return c.json({ ok: true });
  });

  r.get("/history/searches", (c) => c.json(civitai.searches()));
  r.get("/base-models", async (c) => c.json(await civitai.baseModels()));
  r.delete("/history/searches", (c) => {
    const q = c.req.query("q");
    civitai.forgetSearch(q === undefined ? null : q);
    return c.json({ ok: true });
  });

  return r;
}
