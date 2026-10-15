import { Hono } from "hono";
import { ZodError } from "zod";
import { fromBase64Url, parseBrowseQuery, SetCivitaiKeyBody } from "../../shared/civitai.ts";
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

  r.get("/models", async (c) => {
    let parsed: ReturnType<typeof parseBrowseQuery>;
    try {
      parsed = parseBrowseQuery(c.req.query());
    } catch (error) {
      const issue = error instanceof ZodError ? error.issues[0] : undefined;
      throw new HttpError(
        400,
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid filter.",
        "bad_filter",
      );
    }
    return c.json(await civitai.search(parsed.filter, parsed.cursor));
  });

  r.get("/models/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid model id.", "bad_id");
    return c.json(await civitai.model(id));
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

  r.get("/history/searches", (c) => c.json(civitai.searches()));
  r.delete("/history/searches", (c) => {
    const q = c.req.query("q");
    civitai.forgetSearch(q === undefined ? null : q);
    return c.json({ ok: true });
  });

  return r;
}
