import { Hono } from "hono";
import { z } from "zod";
import type { SystemInfo } from "../../shared/api.ts";
import { APP_NAME } from "../../shared/constants.ts";
import { CheckPathBody } from "../../shared/profile.ts";
import type { ServerConfig } from "../config.ts";
import { readJson } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";
import { checkPath, pickFolder, pickImages } from "../services/system.ts";

export function systemRoutes(config: ServerConfig, profiles: ProfileService) {
  const r = new Hono();

  r.get("/", (c) => {
    const info: SystemInfo = {
      app: APP_NAME,
      version: config.version,
      dev: config.dev,
      platform: process.platform,
      dataDir: config.dataDir,
      activeProfileId: profiles.active,
    };
    return c.json(info);
  });

  r.post("/check-path", async (c) => {
    const { path } = await readJson(c, CheckPathBody);
    return c.json(await checkPath(path));
  });

  r.post("/pick-folder", async (c) => {
    const body = await readJson(
      c,
      z.object({
        title: z.string().max(120).default("Choose a folder"),
        initial: z.string().optional(),
      }),
    );
    return c.json({ path: await pickFolder(body.title, body.initial) });
  });

  r.post("/pick-images", async (c) => {
    const body = await readJson(
      c,
      z.object({ title: z.string().max(120).default("Choose images") }),
    );
    return c.json({ paths: await pickImages(body.title) });
  });

  return r;
}
