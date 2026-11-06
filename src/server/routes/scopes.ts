import { Hono } from "hono";
import { SaveScopeBody, ScopeId, ScopesPatch } from "../../shared/scopes.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ScopeService } from "../services/scopes.ts";

/** The profile's scopes (ADR-0019). Pictures are set per model under /api/models/picture. */
export function scopeRoutes(scopes: ScopeService) {
  const r = new Hono();

  const id = (raw: string) => {
    if (!ScopeId.safeParse(raw).success)
      throw new HttpError(400, "That isn't a scope id.", "bad_scope");
    return raw;
  };

  r.get("/", async (c) => c.json(await scopes.get()));
  r.patch("/", async (c) => c.json(await scopes.patch(await readJson(c, ScopesPatch))));
  r.post("/", async (c) => c.json(await scopes.create(await readJson(c, SaveScopeBody))));
  r.put("/:id", async (c) =>
    c.json(await scopes.save(id(c.req.param("id")), await readJson(c, SaveScopeBody))),
  );
  r.delete("/:id", async (c) => c.json(await scopes.remove(id(c.req.param("id")))));

  return r;
}
