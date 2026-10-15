import { Hono } from "hono";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "../services/profiles.ts";
import { listWildcards } from "../services/wildcards.ts";

export function wildcardRoutes(profiles: ProfileService) {
  const r = new Hono();

  r.get("/", async (c) => {
    const id = profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    const profile = await profiles.get(id);
    return c.json({
      root: profile.paths.wildcards,
      names: await listWildcards(profile.paths.wildcards),
    });
  });

  return r;
}
