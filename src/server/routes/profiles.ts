import fs from "node:fs/promises";
import { Hono } from "hono";
import type { OpenProfileResponse, ProfilesResponse } from "../../shared/api.ts";
import {
  CreateProfileBody,
  OpenOnLaunchBody,
  ProfileId,
  ReorderProfilesBody,
  UpdateProfileBody,
} from "../../shared/profile.ts";
import { HttpError, readBody, readBodyToFile, readJson } from "../lib/http.ts";
import { sendFile } from "../lib/send.ts";
import type { ProfileBackup } from "../services/backup.ts";
import type { ProfileService } from "../services/profiles.ts";

const MAX_AVATAR_BYTES = 12 * 1024 * 1024;
const MAX_IMPORT_BYTES = 2 * 1024 ** 3;

export function profileRoutes(
  profiles: ProfileService,
  installPresets: (profileId: string, presetIds: string[]) => Promise<void>,
  backup: ProfileBackup,
) {
  const r = new Hono();

  const id = (raw: string) => {
    const parsed = ProfileId.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "Invalid profile id.", "bad_id");
    return parsed.data;
  };

  r.get("/", async (c) => {
    const body: ProfilesResponse = {
      registry: await profiles.registry(),
      profiles: await profiles.list(),
      activeId: profiles.active,
    };
    return c.json(body);
  });

  r.post("/", async (c) => {
    const body = await readJson(c, CreateProfileBody);
    const profile = await profiles.create(body);
    await installPresets(profile.id, body.presets);
    return c.json(profile, 201);
  });

  r.put("/order", async (c) => {
    const { order } = await readJson(c, ReorderProfilesBody);
    return c.json(await profiles.reorder(order));
  });

  r.put("/open-on-launch", async (c) => {
    const body = await readJson(c, OpenOnLaunchBody);
    return c.json(await profiles.setOpenOnLaunch(body.id));
  });

  /** A new profile from an exported zip (the body is the zip, streamed to runtime/ first). */
  r.post("/import", async (c) => {
    const file = await backup.uploadFile();
    try {
      const size = await readBodyToFile(
        c,
        file,
        MAX_IMPORT_BYTES,
        "That export is over 2 GB; Blombo can't import it.",
      );
      if (size === 0) throw new HttpError(400, "The file is empty.", "empty");
      return c.json(await backup.import(file), 201);
    } finally {
      await fs.rm(file, { force: true }).catch(() => undefined);
    }
  });

  r.get("/:id", async (c) => c.json(await profiles.get(id(c.req.param("id")))));

  /** The whole profile as a zip (without the trash and the Civitai key). */
  r.get("/:id/export", async (c) => {
    const { file, name } = await backup.export(id(c.req.param("id")));
    return sendFile(file, { type: "application/zip", download: name });
  });

  r.patch("/:id", async (c) => {
    const body = await readJson(c, UpdateProfileBody);
    return c.json(await profiles.update(id(c.req.param("id")), body));
  });

  r.delete("/:id", async (c) => {
    await profiles.remove(id(c.req.param("id")));
    return c.body(null, 204);
  });

  r.post("/:id/open", async (c) => {
    const result: OpenProfileResponse = await profiles.open(id(c.req.param("id")));
    return c.json(result);
  });

  r.get("/:id/avatar", async (c) => {
    const pid = id(c.req.param("id"));
    try {
      const data = await fs.readFile(profiles.avatarFile(pid));
      return c.body(data, 200, {
        "content-type": "image/webp",
        "cache-control": "no-cache",
      });
    } catch {
      throw new HttpError(404, "No avatar.", "no_avatar");
    }
  });

  r.put("/:id/avatar", async (c) => {
    const pid = id(c.req.param("id"));
    const data = await readBody(c, MAX_AVATAR_BYTES, "Images up to 12 MB work best for avatars.");
    if (data.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    return c.json(await profiles.setAvatar(pid, data));
  });

  r.delete("/:id/avatar", async (c) => c.json(await profiles.removeAvatar(id(c.req.param("id")))));

  return r;
}
