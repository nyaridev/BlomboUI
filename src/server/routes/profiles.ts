import fs from "node:fs/promises";
import { Hono } from "hono";
import { z } from "zod";
import type { OpenProfileResponse, ProfilesResponse } from "../../shared/api.ts";
import { CreateProfileBody, ProfileId, UpdateProfileBody } from "../../shared/profile.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";

const MAX_AVATAR_BYTES = 12 * 1024 * 1024;

export function profileRoutes(
  profiles: ProfileService,
  installPresets: (profileId: string, presetIds: string[]) => Promise<void>,
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
    const { order } = await readJson(c, z.object({ order: z.array(ProfileId) }));
    return c.json(await profiles.reorder(order));
  });

  r.put("/open-on-launch", async (c) => {
    const body = await readJson(c, z.object({ id: ProfileId.nullable() }));
    return c.json(await profiles.setOpenOnLaunch(body.id));
  });

  r.get("/:id", async (c) => c.json(await profiles.get(id(c.req.param("id")))));

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
    const data = await c.req.arrayBuffer();
    if (data.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    if (data.byteLength > MAX_AVATAR_BYTES)
      throw new HttpError(413, "Images up to 12 MB work best for avatars.", "too_large");
    return c.json(await profiles.setAvatar(pid, data));
  });

  r.delete("/:id/avatar", async (c) => c.json(await profiles.removeAvatar(id(c.req.param("id")))));

  return r;
}
