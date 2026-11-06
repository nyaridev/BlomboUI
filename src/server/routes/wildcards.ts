import path from "node:path";
import { Hono } from "hono";
import { type RenameChange, RenameRefsBody } from "../../shared/prompt/renames.ts";
import {
  CreateWildcardBody,
  MoveWildcardBody,
  RenameWildcardBody,
  SaveWildcardBody,
  WildcardFolderBody,
  type WildcardList,
  WildcardPath,
  WildcardPathBody,
} from "../../shared/wildcards.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { ProfileService } from "../services/profiles.ts";
import { openInFileManager, revealInFileManager } from "../services/system.ts";
import type { WildcardPictures } from "../services/wildcardpics.ts";
import { listWildcards, WildcardFolders, wildcardStats } from "../services/wildcards.ts";

/**
 * The wildcards folders: names, the tree, files, pictures. `renamed` hears every change to
 * wildcard names (renames, moves, YAML keys renamed in a save), so pictures and favorites follow.
 */
export function wildcardRoutes(
  profiles: ProfileService,
  pictures: WildcardPictures,
  renamed: (changes: RenameChange[]) => Promise<void>,
) {
  const r = new Hono();
  const name = (v: string | undefined) => {
    const n = (v ?? "").trim();
    if (!n || n.length > 400) throw new HttpError(400, "Say which wildcard.", "no_name");
    return n;
  };

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
    const paths = f.folders.map((folder) => folder.path);
    return c.json<WildcardList>({
      root: f.folders[0]?.path ?? "",
      names: await listWildcards(paths),
      stats: await wildcardStats(paths),
      pictures: await pictures.urls(),
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
    const saved = await (await files()).save(body.path, body.text, body.baseMtime);
    if (body.renames.length) await renamed(body.renames);
    return c.json(saved);
  });

  r.post("/create", async (c) => {
    const body = await readJson(c, CreateWildcardBody);
    await (await files()).create(body.path, body.type);
    return c.json({ ok: true }, 201);
  });

  r.post("/move", async (c) => {
    const body = await readJson(c, MoveWildcardBody);
    const change = await (await files()).move(body.from, body.to);
    if (change) await renamed([change]);
    return c.json({ ok: true });
  });

  r.post("/trash", async (c) => {
    const body = await readJson(c, WildcardPathBody);
    await (await files()).remove(body.path);
    return c.json({ ok: true });
  });

  r.post("/reveal", async (c) => {
    const body = await readJson(c, WildcardPathBody);
    await revealInFileManager((await files()).abs(body.path));
    return c.json({ ok: true });
  });

  r.post("/rename", async (c) => {
    const body = await readJson(c, RenameWildcardBody);
    const change = await (await files()).rename(body.name, body.to, body.folder);
    await renamed([change]);
    return c.json(change);
  });

  /** The picture you set for a wildcard (its card shows it). */
  r.get("/picture", async (c) =>
    sendFile(await pictures.file(name(c.req.query("name"))), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
      type: "image/jpeg",
    }),
  );
  r.put("/picture", async (c) => {
    const target = name(c.req.query("name"));
    const bytes = await readBody(c, 64 * 1024 * 1024, "Pick an image under 64 MB.");
    if (bytes.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    await pictures.set(target, bytes);
    return c.json({ ok: true });
  });
  r.delete("/picture", async (c) => {
    await pictures.remove(name(c.req.query("name")));
    return c.json({ ok: true });
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
