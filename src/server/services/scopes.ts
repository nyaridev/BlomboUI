/**
 * Scopes (shared/scopes.ts): thumbnails of models per context, kept in the profile
 * (data/profiles/<id>/scopes/<scope>/<kind>/<ComfyUI name>.webp) with the list of scopes in
 * scopes/scopes.json. The "scope thumbnails" script writes pictures here, and so do the Scopes
 * view's "from a gallery image" and upload. The models folder is never written.
 *
 * Models → Local and the pickers show the default scope's picture for a model with no preview
 * of its own (services/models.ts); the client swaps in the chosen scope's pictures from
 * `state().thumbs`. Removing a picture or a scope moves it into the profile's trash.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MODEL_KINDS, type ModelKind } from "../../shared/constants.ts";
import {
  DEFAULT_SCOPE,
  type SaveScopeBody,
  type ScopeDef,
  ScopesFile,
  type ScopesState,
  withDefaultScope,
} from "../../shared/scopes.ts";
import { slugId } from "../../shared/settings.ts";
import { exists, movePath, readJsonFile, writeFileAtomic, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

export { DEFAULT_SCOPE };

// No file cache: on Windows it would keep files open (see lib/thumbs.ts).
sharp.cache(false);

const SIZE = 512;

/** Where a model's scope thumbnail lives, or null for a name that tries to leave the folder. */
export function scopeThumbPath(
  profileDir: string,
  scope: string,
  kind: ModelKind,
  comfyName: string,
): string | null {
  const parts = comfyName.replace(/\\/g, "/").split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || /[\0:]/.test(p))) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(scope)) return null;
  // The kind comes from URLs too: only a known kind is a folder name here.
  if (!(MODEL_KINDS as readonly string[]).includes(kind)) return null;
  return `${path.join(profileDir, "scopes", scope, kind, ...parts)}.webp`;
}

/** Shrink an image into the model's scope thumbnail (replacing the last one). */
export async function saveScopeThumb(
  profileDir: string,
  scope: string,
  kind: ModelKind,
  comfyName: string,
  image: Uint8Array,
): Promise<string | null> {
  const file = scopeThumbPath(profileDir, scope, kind, comfyName);
  if (!file) return null;
  const webp = await sharp(image)
    .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  await writeFileAtomic(file, webp);
  return file;
}

/** Every picture under a scope folder: model key → file. */
async function walkScope(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (sub: string, depth: number) => {
    if (depth > 12) return;
    let items: Dirent[];
    try {
      items = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of items) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(rel, depth + 1);
      else if (e.isFile() && e.name.endsWith(".webp") && rel.includes("/"))
        out.set(rel.slice(0, -".webp".length), path.join(dir, ...rel.split("/")));
    }
  };
  await walk("", 0);
  return out;
}

export interface ScopeDeps {
  profiles: ProfileService;
  /** A model picture changed: model lists refetch. */
  onChanged: () => void;
}

export class ScopeService {
  private readonly deps: ScopeDeps;

  constructor(deps: ScopeDeps) {
    this.deps = deps;
  }

  private profileDir(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return this.deps.profiles.dir(id);
  }

  private root(): string {
    return path.join(this.profileDir(), "scopes");
  }

  private file(): string {
    return path.join(this.root(), "scopes.json");
  }

  async read(): Promise<ScopesFile> {
    let file: ScopesFile;
    try {
      file = await readJsonFile(this.file(), ScopesFile, {});
    } catch {
      throw new HttpError(
        500,
        "scopes/scopes.json couldn't be read. Fix or remove it in the profile folder.",
        "bad_scopes",
      );
    }
    // Folders the script made for scopes that aren't listed yet show up as scopes too.
    const listed = new Set(file.scopes.map((s) => s.id));
    let dirs: Dirent[] = [];
    try {
      dirs = await fs.readdir(this.root(), { withFileTypes: true });
    } catch {
      // No scopes folder yet.
    }
    const found: ScopeDef[] = dirs
      .filter((d) => d.isDirectory() && /^[a-z0-9][a-z0-9-]{0,39}$/.test(d.name))
      .filter((d) => !listed.has(d.name))
      .map((d) => ({ id: d.name, name: d.name, group: "", tags: [] }));
    const scopes = withDefaultScope([...file.scopes, ...found]);
    const active = scopes.some((s) => s.id === file.active) ? file.active : DEFAULT_SCOPE;
    return { ...file, active, scopes };
  }

  private async write(file: ScopesFile): Promise<void> {
    await writeJsonAtomic(this.file(), { ...file, format: "blombo.scopes/1" });
  }

  async state(): Promise<ScopesState> {
    const file = await this.read();
    const thumbs: ScopesState["thumbs"] = {};
    for (const s of file.scopes) {
      const files = await walkScope(path.join(this.root(), s.id));
      const map: Record<string, string> = {};
      for (const [key, abs] of files) {
        const st = await fs.stat(abs).catch(() => null);
        if (!st) continue;
        const v = `${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}`;
        map[key] =
          `/api/scopes/thumb?scope=${encodeURIComponent(s.id)}&key=${encodeURIComponent(key)}&v=${v}`;
      }
      thumbs[s.id] = map;
    }
    return { ...file, thumbs };
  }

  async setOptions(patch: { active?: string; auto?: boolean }): Promise<ScopesState> {
    const file = await this.read();
    if (patch.active && !file.scopes.some((s) => s.id === patch.active))
      throw new HttpError(404, "That scope doesn't exist anymore.", "no_scope");
    await this.write({ ...file, ...patch });
    return this.state();
  }

  async create(body: SaveScopeBody): Promise<ScopeDef> {
    const file = await this.read();
    const base = slugId(body.name, "scope");
    let id = base;
    for (let n = 2; file.scopes.some((s) => s.id === id); n++) id = `${base}-${n}`;
    const scope: ScopeDef = {
      id,
      name: body.name.trim(),
      group: body.group?.trim() ?? "",
      tags: body.tags ?? [],
    };
    await this.write({ ...file, scopes: [...file.scopes, scope] });
    return scope;
  }

  async update(id: string, body: SaveScopeBody): Promise<ScopeDef> {
    const file = await this.read();
    const current = file.scopes.find((s) => s.id === id);
    if (!current) throw new HttpError(404, "That scope doesn't exist anymore.", "no_scope");
    const next: ScopeDef = {
      id,
      name: body.name.trim(),
      group: body.group?.trim() ?? "",
      tags: [...new Set((body.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    };
    await this.write({ ...file, scopes: file.scopes.map((s) => (s.id === id ? next : s)) });
    return next;
  }

  /** Remove a scope; its pictures go to the profile's trash. The default scope stays. */
  async remove(id: string): Promise<void> {
    if (id === DEFAULT_SCOPE)
      throw new HttpError(400, "The default scope can't be removed.", "default_scope");
    const file = await this.read();
    if (!file.scopes.some((s) => s.id === id))
      throw new HttpError(404, "That scope doesn't exist anymore.", "no_scope");
    const dir = path.join(this.root(), id);
    if (await exists(dir))
      await movePath(dir, path.join(this.profileDir(), "trash", "scopes", `${Date.now()}-${id}`));
    await this.write({
      ...file,
      active: file.active === id ? DEFAULT_SCOPE : file.active,
      scopes: file.scopes.filter((s) => s.id !== id),
    });
    this.deps.onChanged();
  }

  /** The file behind a thumbnail URL (scope + model key), checked to stay in the scope. */
  async thumbFile(scope: string, key: string): Promise<string> {
    const [kind, ...rest] = key.split("/");
    const file = scopeThumbPath(this.profileDir(), scope, kind as ModelKind, rest.join("/"));
    if (!file || !(await exists(file)))
      throw new HttpError(404, "No picture for that model in this scope.", "no_thumb");
    return file;
  }

  async setThumb(scope: string, kind: ModelKind, name: string, image: Uint8Array): Promise<void> {
    const file = await this.read();
    if (!file.scopes.some((s) => s.id === scope))
      throw new HttpError(404, "That scope doesn't exist anymore.", "no_scope");
    let saved: string | null;
    try {
      saved = await saveScopeThumb(this.profileDir(), scope, kind, name, image);
    } catch {
      throw new HttpError(400, "That file isn't an image Blombo can read.", "bad_image");
    }
    if (!saved) throw new HttpError(400, "That model name isn't valid.", "bad_name");
    this.deps.onChanged();
  }

  /** Move a model's picture in a scope to the profile's trash. */
  async removeThumb(scope: string, kind: ModelKind, name: string): Promise<void> {
    const file = scopeThumbPath(this.profileDir(), scope, kind, name);
    if (!file || !(await exists(file)))
      throw new HttpError(404, "That picture is already gone.", "no_thumb");
    const dest = path.join(
      this.profileDir(),
      "trash",
      "scopes",
      `${Date.now()}-${scope}`,
      kind,
      ...name.split("/"),
    );
    await movePath(file, `${dest}.webp`);
    this.deps.onChanged();
  }
}
