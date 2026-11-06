/**
 * The dev-only Saved data view's answers (`routes/dev.ts`, dev mode only): the open profile's folder
 * and database tables, and the raw metadata of one gallery image. Read-only; file contents are
 * never sent from here (only names and sizes), so `secrets.json` stays on the server.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { DevChunk, DevFile, DevImageMeta, DevStorage, DevTable } from "../../shared/dev.ts";
import { MIGRATIONS, type ProfileDbs } from "../db/profileDb.ts";
import { HttpError } from "../lib/http.ts";
import { readImageHead } from "../lib/imagemeta.ts";
import { readMediaHead } from "../lib/mediameta.ts";
import { readSidecar } from "./gallery/files.ts";
import type { GalleryService } from "./gallery/index.ts";
import type { ProfileService } from "./profiles.ts";

/** Folders shown as one row with a file count (their files are the user's, not app data). */
const COLLAPSED = new Set(["trash"]);
const MAX_FILES = 400;

export interface DevInfoDeps {
  profiles: ProfileService;
  dbs: ProfileDbs;
  gallery: GalleryService;
}

export class DevInfoService {
  private readonly deps: DevInfoDeps;

  constructor(deps: DevInfoDeps) {
    this.deps = deps;
  }

  private active(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  async storage(): Promise<DevStorage> {
    const profileId = this.active();
    const dir = this.deps.profiles.dir(profileId);
    const { files, truncated } = await listFiles(dir);
    const { db } = this.deps.dbs.get(profileId);
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version;
    return {
      profileId,
      dir,
      files,
      truncated,
      db: {
        file: path.join(dir, "blombo.sqlite"),
        version,
        latest: MIGRATIONS.length,
        tables: describeTables(db),
      },
    };
  }

  async image(id: number): Promise<DevImageMeta> {
    const { gallery } = this.deps;
    const image = gallery.get(id);
    if (!image) throw new HttpError(404, "That image isn't in the gallery anymore.", "no_image");
    const file = await gallery.filePath(id);
    const pictures = image.media === "image" || image.media === "animated";
    const head = pictures ? await readImageHead(file) : await readMediaHead(file);
    const format = "format" in head ? head.format : path.extname(file).slice(1).toLowerCase();
    const details = await gallery.details(id);
    return {
      id,
      path: image.path,
      file,
      format,
      chunks: Object.entries(head.text).map(([key, text]) => toChunk(key, text)),
      sidecar: image.origin === "civitai" ? await readSidecar(file) : null,
      index: { summary: details.summary, settings: details.settings },
    };
  }
}

export function toChunk(key: string, text: string): DevChunk {
  let json: unknown = null;
  if (/^\s*[{[]/.test(text))
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  return { key, length: text.length, text, json };
}

/** The profile folder, folders first; `trash/` as one row. Stops at MAX_FILES rows. */
export async function listFiles(root: string): Promise<{ files: DevFile[]; truncated: boolean }> {
  const files: DevFile[] = [];
  let truncated = false;
  const walk = async (rel: string): Promise<void> => {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    entries.sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    );
    for (const e of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const child = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(root, child);
      if (e.isDirectory()) {
        if (!rel && COLLAPSED.has(e.name)) {
          const { count, size } = await folderTotals(abs);
          files.push({ path: child, size, dir: true, files: count });
          continue;
        }
        files.push({ path: child, size: 0, dir: true, files: null });
        await walk(child);
      } else if (e.isFile()) {
        const stat = await fs.stat(abs).catch(() => null);
        files.push({ path: child, size: stat?.size ?? 0, dir: false, files: null });
      }
    }
  };
  await walk("");
  return { files, truncated };
}

async function folderTotals(dir: string): Promise<{ count: number; size: number }> {
  let count = 0;
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isFile()) continue;
    count++;
    size += (await fs.stat(path.join(e.parentPath, e.name)).catch(() => null))?.size ?? 0;
  }
  return { count, size };
}

/** Tables and views with their columns, indexes and row counts; FTS5's own tables left out. */
export function describeTables(db: DatabaseSync): DevTable[] {
  const rows = db
    .prepare(
      "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string; type: string; sql: string | null }>;
  const virtual = rows.filter((r) => /^CREATE VIRTUAL TABLE/i.test(r.sql ?? "")).map((r) => r.name);
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  return rows
    .filter((r) => !virtual.some((v) => r.name.startsWith(`${v}_`)))
    .map((r) => {
      const kind = r.type === "view" ? "view" : virtual.includes(r.name) ? "virtual" : "table";
      let count: number | null = null;
      try {
        count = Number(
          (db.prepare(`SELECT count(*) AS n FROM ${quote(r.name)}`).get() as { n: number }).n,
        );
      } catch {
        count = null;
      }
      const columns = (
        db.prepare(`PRAGMA table_info(${quote(r.name)})`).all() as Array<{
          name: string;
          type: string;
          notnull: number;
          pk: number;
          dflt_value: string | null;
        }>
      ).map((c) => ({
        name: c.name,
        type: c.type,
        notNull: Boolean(c.notnull),
        pk: Number(c.pk),
        default: c.dflt_value,
      }));
      const indexes =
        kind === "table"
          ? (
              db.prepare(`PRAGMA index_list(${quote(r.name)})`).all() as Array<{ name: string }>
            ).map((i) => i.name)
          : [];
      return { name: r.name, kind, rows: count, columns, indexes, sql: r.sql ?? "" };
    });
}
