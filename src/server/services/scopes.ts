/**
 * Scopes (ADR-0019): the profile's list of scopes, whether they're on and which ones cards show,
 * in scopes.json in the profile folder. The pictures themselves are files next to the models
 * (services/modelthumbs.ts), named after scope ids, so renaming a scope never touches them;
 * deleting one moves its pictures to the profile's trash.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { salvage } from "../../shared/salvage.ts";
import {
  type DeletedScope,
  newScopeId,
  type ScopeDef,
  ScopesFile,
  type ScopesPatch,
} from "../../shared/scopes.ts";
import { writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

export interface ScopeDeps {
  profiles: ProfileService;
  /** Move every picture made for this scope to the trash; returns how many. */
  removePictures: (scopeId: string) => Promise<number>;
}

export class ScopeService {
  private readonly deps: ScopeDeps;
  /** Changes run one at a time, so two clicks never write over each other. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(deps: ScopeDeps) {
    this.deps = deps;
  }

  private file(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return path.join(this.deps.profiles.dir(id), "scopes.json");
  }

  async get(): Promise<ScopesFile> {
    let text: string;
    try {
      text = await fs.readFile(this.file(), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ScopesFile.parse({});
      throw error;
    }
    try {
      // It's hand-editable: keep every scope that's still valid.
      return salvage(ScopesFile, JSON.parse(text)).data;
    } catch {
      throw new HttpError(
        500,
        "scopes.json couldn't be read. Fix or move it in the profile folder.",
        "bad_scopes",
      );
    }
  }

  private change<T>(fn: (current: ScopesFile) => Promise<{ next: ScopesFile; result: T }>) {
    const run = this.chain
      .catch(() => undefined)
      .then(async () => {
        const { next, result } = await fn(await this.get());
        await writeJsonAtomic(this.file(), next);
        return result;
      });
    this.chain = run;
    return run;
  }

  /** Turn scopes on or off, or change which ones cards show. */
  patch(body: ScopesPatch): Promise<ScopesFile> {
    return this.change(async (cur) => {
      const next = { ...cur, ...body };
      return { next, result: next };
    });
  }

  create(body: Omit<ScopeDef, "id">): Promise<ScopeDef> {
    return this.change(async (cur) => {
      if (cur.scopes.length >= 500)
        throw new HttpError(400, "That's 500 scopes already. Delete some first.", "too_many");
      checkName(cur.scopes, body.name);
      let id = newScopeId();
      while (cur.scopes.some((s) => s.id === id)) id = newScopeId();
      const scope: ScopeDef = { id, name: body.name, group: body.group, tags: body.tags };
      return { next: { ...cur, scopes: [...cur.scopes, scope] }, result: scope };
    });
  }

  save(id: string, body: Omit<ScopeDef, "id">): Promise<ScopeDef> {
    return this.change(async (cur) => {
      if (!cur.scopes.some((s) => s.id === id))
        throw new HttpError(404, "That scope is gone. Reload the list.", "no_scope");
      checkName(cur.scopes, body.name, id);
      const scope: ScopeDef = { id, name: body.name, group: body.group, tags: body.tags };
      return {
        next: { ...cur, scopes: cur.scopes.map((s) => (s.id === id ? scope : s)) },
        result: scope,
      };
    });
  }

  /** Delete a scope; its pictures go to the profile's trash first. */
  remove(id: string): Promise<DeletedScope> {
    return this.change(async (cur) => {
      if (!cur.scopes.some((s) => s.id === id))
        throw new HttpError(404, "That scope is already gone.", "no_scope");
      const pictures = await this.deps.removePictures(id);
      const drop = (ids: string[]) => ids.filter((x) => x !== id);
      return {
        next: {
          ...cur,
          scopes: cur.scopes.filter((s) => s.id !== id),
          view: { ...cur.view, ids: drop(cur.view.ids), optional: drop(cur.view.optional) },
        },
        result: { pictures },
      };
    });
  }
}

function checkName(scopes: ScopeDef[], name: string, except?: string): void {
  const low = name.trim().toLowerCase();
  if (scopes.some((s) => s.id !== except && s.name.toLowerCase() === low))
    throw new HttpError(
      409,
      `There's a scope named "${name.trim()}" already. Pick another name.`,
      "exists",
    );
}
