/**
 * Profile export and import: a whole profile folder as one zip, to back it up or move it to
 * another PC. The zip holds everything in data/profiles/<id>/ except the trash and secrets.json
 * (the Civitai key stays on this computer), plus a consistent copy of the profile database
 * (`VACUUM INTO`, so an open database is copied safely) and a small manifest.
 *
 * Importing never replaces a profile: it becomes a new one (a fresh id if the name is taken),
 * and every path in the zip is checked to stay inside the new folder. Folders the profile points
 * at (models, outputs, wildcards) aren't in the zip; on another PC you set them in Settings.
 *
 * Both directions stream: files are read, deflated or inflated and written in chunks (fflate's
 * Zip / Unzip), and an upload lands in runtime/cache/imports/ before it's read. A large profile
 * never sits in memory whole and never holds up other requests.
 */
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, Unzip, UnzipInflate, Zip, ZipDeflate } from "fflate";
import { z } from "zod";
import { type Profile, Profile as ProfileSchema } from "../../shared/profile.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import { exists } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

export const EXPORT_FORMAT = "blombo.profile-export/1";
const MANIFEST = "blombo-profile.json";
const DB_FILE = "blombo.sqlite";
/** Left out of exports: restorable trash, the secret key, the live database files. */
const SKIP = [/^trash(\/|$)/, /^secrets\.json$/, /^blombo\.sqlite(-wal|-shm|-journal)?$/];
/** What an import may unpack in all. */
const MAX_IMPORT_BYTES = 4 * 1024 ** 3;
/** The manifest and profile.json are read into memory; real ones are a few hundred bytes. */
const MAX_HEADER_FILE = 1024 * 1024;
/** Exports and uploads older than this are a finished download's or a crash's leftovers. */
const LEFTOVER_MS = 3600_000;
const CHUNK = 256 * 1024;

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

/** Remove a work folder's entries (named `<ms>-…`) older than LEFTOVER_MS. */
async function sweep(dir: string): Promise<void> {
  const now = Date.now();
  for (const f of await fs.readdir(dir).catch(() => [])) {
    const at = Number(f.split("-")[0]);
    if (!Number.isFinite(at) || now - at > LEFTOVER_MS)
      await fs.rm(path.join(dir, f), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Where one entry of a zip goes while it's read: its chunks in order, then `end`. */
interface EntrySink {
  write(chunk: Uint8Array): Promise<void> | void;
  end(): Promise<void> | void;
}

/**
 * Read a zip file in chunks and hand each entry to the sink `open` returns for it (null skips
 * the entry without inflating it). What one chunk inflates to is written before the next chunk
 * is read, so memory stays at a chunk's worth and the event loop never waits long.
 */
async function readZip(file: string, open: (name: string) => EntrySink | null): Promise<void> {
  const writes: (() => Promise<void> | void)[] = [];
  let failed: unknown = null;
  const unzip = new Unzip((entry) => {
    const sink = open(entry.name);
    if (!sink) return;
    entry.ondata = (err, chunk, final) => {
      if (err) {
        failed ??= err;
        return;
      }
      if (chunk.byteLength) writes.push(() => sink.write(chunk));
      if (final) writes.push(() => sink.end());
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const flush = async () => {
    if (failed) throw failed;
    for (let next = writes.shift(); next; next = writes.shift()) await next();
  };
  for await (const chunk of createReadStream(file, { highWaterMark: CHUNK })) {
    unzip.push(chunk as Uint8Array);
    await flush();
  }
  unzip.push(new Uint8Array(0), true);
  await flush();
}

/** Whether a file starts like a zip (a local file header). */
async function looksLikeZip(file: string): Promise<boolean> {
  const fh = await fs.open(file, "r");
  try {
    const head = new Uint8Array(4);
    const { bytesRead } = await fh.read(head, 0, 4, 0);
    return bytesRead === 4 && strFromU8(head, true) === "PK\x03\x04";
  } finally {
    await fh.close();
  }
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
    // Each export has its own folder, so one that's still downloading is never removed by the next.
    await sweep(outDir);
    const workDir = path.join(outDir, `${Date.now()}-${randomUUID().slice(0, 8)}`);
    await fs.mkdir(workDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${id}-${stamp}.blombo-profile.zip`;
    const file = path.join(workDir, name);
    const snapshot = path.join(workDir, `${id}.sqlite`);

    const out = await fs.open(file, "w");
    const pending: Uint8Array[] = [];
    let failed: unknown = null;
    const zip = new Zip((err, chunk) => {
      if (err) failed ??= err;
      else if (chunk.byteLength) pending.push(chunk);
    });
    const flush = async () => {
      if (failed) throw failed;
      for (let next = pending.shift(); next; next = pending.shift()) await out.write(next);
    };
    const addFile = async (rel: string, source: string) => {
      const entry = new ZipDeflate(rel, { level: 6 });
      zip.add(entry);
      for await (const chunk of createReadStream(source, { highWaterMark: CHUNK })) {
        entry.push(chunk as Uint8Array);
        await flush();
      }
      entry.push(new Uint8Array(0), true);
      await flush();
    };

    try {
      for (const rel of await walk(dir)) await addFile(rel, path.join(dir, rel));

      // A consistent copy of the database, even while it's open.
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
          await addFile(DB_FILE, snapshot);
        }
      } finally {
        // Close a connection opened just for this, unless the profile was opened meanwhile.
        if (this.deps.profiles.active !== id) this.deps.dbs.close(id);
        await fs.rm(snapshot, { force: true }).catch(() => undefined);
      }

      const manifest = new ZipDeflate(MANIFEST, { level: 6 });
      zip.add(manifest);
      const exportedAt = new Date().toISOString();
      manifest.push(
        strToU8(JSON.stringify({ format: EXPORT_FORMAT, name: profile.name, id, exportedAt })),
        true,
      );
      zip.end();
      await flush();
      await out.close();
    } catch (error) {
      zip.terminate();
      await out.close().catch(() => undefined);
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    return { file, name };
  }

  /**
   * A fresh path in runtime/cache/imports/ for an upload to stream into before `import` reads
   * it. The caller removes it when done; a crash's leftovers are swept on the next upload.
   */
  async uploadFile(): Promise<string> {
    const dir = path.join(this.deps.runtimeDir, "cache", "imports");
    await fs.mkdir(dir, { recursive: true });
    await sweep(dir);
    return path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}.zip`);
  }

  /**
   * Make a new profile from an exported zip file. It's read twice: once for the manifest and
   * profile.json, then, when they check out, to unpack the rest into the new profile's folder.
   */
  async import(zipFile: string): Promise<Profile> {
    const badZip = () =>
      new HttpError(
        400,
        "That isn't a profile export Blombo can read. Pick the .blombo-profile.zip from Export profile.",
        "bad_zip",
      );
    if (!(await looksLikeZip(zipFile))) throw badZip();

    const header: Record<string, Uint8Array> = {};
    try {
      await readZip(zipFile, (name) => {
        if (name !== MANIFEST && name !== "profile.json") return null;
        const chunks: Uint8Array[] = [];
        let size = 0;
        return {
          write: (chunk) => {
            size += chunk.byteLength;
            if (size > MAX_HEADER_FILE) throw new Error("too big");
            chunks.push(chunk);
          },
          end: () => {
            header[name] = new Uint8Array(Buffer.concat(chunks, size));
          },
        };
      });
    } catch {
      throw badZip();
    }
    const manifestBytes = header[MANIFEST];
    let manifest: ReturnType<typeof ExportManifest.safeParse> | null = null;
    try {
      manifest = manifestBytes
        ? ExportManifest.safeParse(JSON.parse(strFromU8(manifestBytes)))
        : null;
    } catch {
      manifest = null;
    }
    const profileBytes = header["profile.json"];
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
    // The folder isn't listed until `adopt`, so nothing else reads or writes it meanwhile and
    // plain streamed writes are safe; a failed import removes it again.
    let total = 0;
    const open = new Set<fs.FileHandle>();
    try {
      await readZip(zipFile, (name) => {
        const rel = safeEntry(name);
        if (
          !rel ||
          rel === MANIFEST ||
          rel === "profile.json" ||
          SKIP.slice(0, 2).some((re) => re.test(rel))
        )
          return null;
        const target = path.join(dir, ...rel.split("/"));
        let handle: fs.FileHandle | null = null;
        const ensure = async () => {
          if (handle) return handle;
          await fs.mkdir(path.dirname(target), { recursive: true });
          handle = await fs.open(target, "w");
          open.add(handle);
          return handle;
        };
        return {
          write: async (chunk) => {
            total += chunk.byteLength;
            if (total > MAX_IMPORT_BYTES)
              throw new HttpError(
                413,
                "That export unpacks to more than 4 GB; Blombo can't import it.",
                "too_large",
              );
            await (await ensure()).write(chunk);
          },
          end: async () => {
            const h = await ensure();
            open.delete(h);
            await h.close();
          },
        };
      });
    } catch (error) {
      for (const h of open) await h.close().catch(() => undefined);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw error instanceof HttpError ? error : badZip();
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
