import path from "node:path";
import { Hono } from "hono";
import {
  CreateWildcardBody,
  MoveWildcardBody,
  RollBody,
  SaveWildcardBody,
  type WildcardList,
  WildcardPath,
  WildcardPathBody,
} from "../../shared/wildcards.ts";
import { resolveInside } from "../lib/fsx.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";
import { revealInFileManager } from "../services/system.ts";
import { listWildcards, WildcardFiles } from "../services/wildcards.ts";

export function wildcardRoutes(profiles: ProfileService) {
  const r = new Hono();

  const files = async () => {
    const id = profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    const profile = await profiles.get(id);
    return new WildcardFiles(
      profile.paths.wildcards,
      path.join(profiles.dir(id), "trash", "wildcards"),
    );
  };

  /** Names only (prompt autocomplete, pickers). */
  r.get("/", async (c) => {
    const f = await files();
    return c.json<WildcardList>({ root: f.root, names: await listWildcards(f.root) });
  });

  r.get("/tree", async (c) => c.json(await (await files()).tree()));

  r.get("/file", async (c) => {
    const parsed = WildcardPath.safeParse(c.req.query("path") ?? "");
    if (!parsed.success) throw new HttpError(400, "Invalid wildcard path.", "bad_path");
    return c.json(await (await files()).read(parsed.data));
  });

  r.put("/file", async (c) => {
    const body = await readJson(c, SaveWildcardBody);
    return c.json(await (await files()).save(body.path, body.text, body.baseMtime));
  });

  r.post("/create", async (c) => {
    const body = await readJson(c, CreateWildcardBody);
    await (await files()).create(body.path, body.type);
    return c.json({ ok: true }, 201);
  });

  r.post("/move", async (c) => {
    const body = await readJson(c, MoveWildcardBody);
    await (await files()).move(body.from, body.to);
    return c.json({ ok: true });
  });

  r.post("/trash", async (c) => {
    const body = await readJson(c, WildcardPathBody);
    await (await files()).remove(body.path);
    return c.json({ ok: true });
  });

  r.post("/roll", async (c) => {
    const body = await readJson(c, RollBody);
    return c.json(await (await files()).roll(body.text, body.count, body.seed, body.overrides));
  });

  r.post("/reveal", async (c) => {
    const body = await readJson(c, WildcardPathBody);
    const f = await files();
    if (!f.root) throw new HttpError(409, "Set a wildcards folder first.", "no_root");
    await revealInFileManager(resolveInside(f.root, body.path));
    return c.json({ ok: true });
  });

  return r;
}
