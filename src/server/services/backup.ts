/**
 * Profile export and import: a whole profile folder as one zip, to back it up or move it to
 * another PC. The zip holds everything in data/profiles/<id>/ except the trash and secrets.json
 * (the Civitai key stays on this computer), plus a consistent copy of the profile database
 * (`VACUUM INTO`, so an open database is copied safely) and a small manifest.
 *
 * Importing never replaces a profile: it becomes a new one (a fresh id if the name is taken),
 * and every path in the zip is checked to stay inside the new folder. Folders the profile points
 * at (models, outputs, wildcards) aren't in the zip; on another PC you set them in Settings.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { type Profile, Profile as ProfileSchema } from "../../shared/profile.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import { exists, writeFileAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

export const EXPORT_FORMAT = "blombo.profile-export/1";
const MANIFEST = "blombo-profile.json";
const DB_FILE = "blombo.sqlite";
/** Left out of exports: restorable trash, the secret key, the live database files. */
const SKIP = [/^trash(\/|$)/, /^secrets\.json$/, /^blombo\.sqlite(-wal|-shm|-journal)?$/];
const MAX_IMPORT_BYTES = 4 * 1024 ** 3;

const ExportManifest = z.object({
  format: z.literal(EXPORT_FORMAT),
  name: z.string(),
  id: z.string(),
  exportedAt: z.string(),
});

export interface BackupDeps {
  profiles: ProfileService;
  dbs: ProfileDbs;
  runtimeDir: string;
}

async function walk(root: string, rel = "", out: string[] = []): Promise<string[]> {
  const items = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
  for (const e of items) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (SKIP.some((re) => re.test(r))) continue;
    if (e.isDirectory()) await walk(root, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/** A zip entry name that stays inside the profile folder, or null. */
export function safeEntry(name: string): string | null {
  const norm = name.replace(/\\/g, "/");
  if (norm.endsWith("/")) return null;
  const parts = norm.split("/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null;
  if (parts.some((p) => p === "" || p === "." || p === ".." || /[<>:"|?*]/.test(p))) return null;
  return parts.join("/");
}

export class ProfileBackup {
  private readonly deps: BackupDeps;

  constructor(deps: BackupDeps) {
    this.deps = deps;
  }

  /** Write the profile's zip into runtime/cache/exports/ and return its path and file name. */
  async export(id: string): Promise<{ file: string; name: string }> {
    const profile = await this.deps.profiles.get(id);
    const dir = this.deps.profiles.dir(id);
    const outDir = path.join(this.deps.runtimeDir, "cache", "exports");
    await fs.mkdir(outDir, { recursive: true });
    // Old exports are only a download's leftovers. Each export has its own folder, so one that's
    // still downloading is never removed by the next.
    const now = Date.now();
    for (const f of await fs.readdir(outDir).catch(() => [])) {
      const at = Number(f.split("-")[0]);
      if (!Number.isFinite(at) || now - at > 3600_000)
        await fs.rm(path.join(outDir, f), { recursive: true, force: true }).catch(() => undefined);
    }
    const workDir = path.join(outDir, `${now}-${randomUUID().slice(0, 8)}`);
    await fs.mkdir(workDir, { recursive: true });

    const files: Record<string, Uint8Array> = {};
    for (const rel of await walk(dir))
      files[rel] = new Uint8Array(await fs.readFile(path.join(dir, rel)));

    // A consistent copy of the database, even while it's open.
    const snapshot = path.join(workDir, `${id}.sqlite`);
    try {
      if (this.deps.profiles.active === id || (await exists(path.join(dir, DB_FILE)))) {
        this.deps.dbs.get(id).db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
        // The trash folder isn't exported, so its rows would point at nothing after an import.
        const copy = new DatabaseSync(snapshot);
        try {
          copy.exec("DELETE FROM trash");
        } finally {
          copy.close();
        }
        files[DB_FILE] = new Uint8Array(await fs.readFile(snapshot));
      }
    } finally {
      // Close a connection opened just for this, unless the profile was opened meanwhile.
      if (this.deps.profiles.active !== id) this.deps.dbs.close(id);
      await fs.rm(snapshot, { force: true }).catch(() => undefined);
    }
    files[MANIFEST] = strToU8(
      JSON.stringify(
        { format: EXPORT_FORMAT, name: profile.name, id, exportedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    const zip = zipSync(files, { level: 6 });
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${id}-${stamp}.blombo-profile.zip`;
    const file = path.join(workDir, name);
    await writeFileAtomic(file, zip);
    return { file, name };
  }

  /** Make a new profile from an exported zip. */
  async import(bytes: Uint8Array): Promise<Profile> {
    let total = 0;
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, {
        filter: (f) => {
          total += f.originalSize;
          if (total > MAX_IMPORT_BYTES) throw new Error("too big");
          return true;
        },
      });
    } catch {
      throw new HttpError(
        400,
        "That isn't a profile export Blombo can read. Pick the .blombo-profile.zip from Export profile.",
        "bad_zip",
      );
    }
    const manifestBytes = entries[MANIFEST];
    let manifest: ReturnType<typeof ExportManifest.safeParse> | null = null;
    try {
      manifest = manifestBytes
        ? ExportManifest.safeParse(JSON.parse(strFromU8(manifestBytes)))
        : null;
    } catch {
      manifest = null;
    }
    const profileBytes = entries["profile.json"];
    if (!manifest?.success || !profileBytes)
      throw new HttpError(
        400,
        "That zip isn't a Blombo profile export (it has no blombo-profile.json).",
        "not_export",
      );
    let original: Profile;
    try {
      original = ProfileSchema.parse(JSON.parse(strFromU8(profileBytes)));
    } catch {
      throw new HttpError(400, "The profile in that zip is damaged.", "bad_profile");
    }

    const registry = await this.deps.profiles.registry();
    const id = await this.deps.profiles.freeId(original.name);
    const dir = this.deps.profiles.dir(id);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, data] of Object.entries(entries)) {
      const rel = safeEntry(name);
      if (
        !rel ||
        rel === MANIFEST ||
        rel === "profile.json" ||
        SKIP.slice(0, 2).some((re) => re.test(rel))
      )
        continue;
      await writeFileAtomic(path.join(dir, ...rel.split("/")), data);
    }
    const taken = registry.order.some((p) => p === original.id);
    const profile: Profile = {
      ...original,
      id,
      name: taken && original.name.length <= 31 ? `${original.name} (imported)` : original.name,
      lastOpenedAt: null,
    };
    // Listed last, so a failed import never shows a half-written profile.
    return this.deps.profiles.adopt(profile);
  }
}
