import path from "node:path";
import { Hono } from "hono";
import { RenameRefsBody } from "../../shared/prompt/renames.ts";
import {
  CreateWildcardBody,
  MoveWildcardBody,
  RenameWildcardBody,
  RollBody,
  SaveWildcardBody,
  WildcardFolderBody,
  type WildcardList,
  WildcardPath,
  WildcardPathBody,
} from "../../shared/wildcards.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";
import { openInFileManager, revealInFileManager } from "../services/system.ts";
import { listWildcards, WildcardFolders } from "../services/wildcards.ts";

export function wildcardRoutes(profiles: ProfileService) {
  const r = new Hono();

  const files = async () => {
    const id = profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    const profile = await profiles.get(id);
    return new WildcardFolders(
      profile.folders.wildcards,
      path.join(profiles.dir(id), "trash", "wildcards"),
    );
  };

  /** Names only (prompt autocomplete, pickers). */
  r.get("/", async (c) => {
    const f = await files();
    return c.json<WildcardList>({
      root: f.folders[0]?.path ?? "",
      names: await listWildcards(f.folders.map((folder) => folder.path)),
    });
  });

  r.get("/tree", async (c) => c.json(await (await files()).tree()));

  /** Wildcard info: where it's defined, its entry count and the first few (?name=people/actors). */
  r.get("/info", async (c) => {
    const name = c.req.query("name")?.trim();
    if (!name) throw new HttpError(400, "Say which wildcard (?name=…).", "no_name");
    return c.json(await (await files()).info(name));
  });

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
    await revealInFileManager((await files()).abs(body.path));
    return c.json({ ok: true });
  });

  r.post("/rename", async (c) => {
    const body = await readJson(c, RenameWildcardBody);
    return c.json(await (await files()).rename(body.name, body.to, body.folder));
  });

  r.post("/rename-refs", async (c) => {
    const body = await readJson(c, RenameRefsBody);
    return c.json(await (await files()).renameRefs(body.changes));
  });

  r.post("/open-folder", async (c) => {
    const body = await readJson(c, WildcardFolderBody);
    await openInFileManager(await (await files()).folderPath(body.folder));
    return c.json({ ok: true });
  });

  return r;
}
