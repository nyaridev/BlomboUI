import { Hono } from "hono";
import { SettingsPatch } from "../../shared/settings.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";
import type { SettingsService } from "../services/settings.ts";

export function settingsRoutes(profiles: ProfileService, settings: SettingsService) {
  const r = new Hono();

  const active = () => {
    const id = profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  };

  r.get("/", async (c) => c.json(await settings.get(active())));

  r.patch("/", async (c) => {
    const patch = await readJson(c, SettingsPatch);
    return c.json(await settings.update(active(), patch));
  });

  return r;
}
