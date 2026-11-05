/**
 * The gallery service: indexes the profile's output folders (main and secondary) into the
 * profile database, answers list and search queries, makes thumbnails, and handles favorites
 * and the trash.
 *
 *  - Sync is incremental: files whose size and mtime match the index are skipped, new or
 *    changed files have their headers read (never their pixels), and rows for files that are
 *    gone are dropped. It runs in the background with progress on the live bus.
 *  - Finished jobs are indexed as their images land (`ingestOutput`), so new images appear
 *    without a rescan.
 *  - Lists, counts and the showcase follow the gallery settings: script grids and images from
 *    stopped runs (marked in `interrupted` when a run is interrupted) can be left out.
 *  - Removing an image moves the file into data/profiles/<id>/trash/gallery/ (restorable);
 *    nothing in a user folder is ever deleted.
 *  - Images added from your PC or Civitai (imports.ts) sit in `imported/` and `civitai/` at the
 *    top of an output folder; lists can show or hide each origin. A Civitai image's sidecar
 *    names the model versions that made it (`image_versions`): the model and LoRA filters list
 *    and find it through the local models that are those versions, never by Civitai's names, so
 *    a LoRA you don't have never shows up there.
 */
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { StatementSync } from "node:sqlite";
import {
  type Collection,
  fileUrl,
  type GalleryFacets,
  type GalleryImage,
  type GalleryOverview,
  type GalleryPage,
  type GalleryQuery,
  IMAGE_ORIGINS,
  type ImageDetails,
  type ImageOrigin,
  interruptedFolder,
  type LibraryInfo,
  type MediaKind,
  mediaOf,
  OUTPUTS_LIBRARY,
  originOf,
  type SyncState,
  type TagCount,
  type TrashEntry,
  thumbUrl,
} from "../../../shared/gallery.ts";
import {
  EMPTY_SUMMARY,
  ImageSettings,
  ImageSummary,
  searchText,
} from "../../../shared/imageinfo.ts";
import type { LiveTopic, ServerMessage } from "../../../shared/live.ts";
import type { LocalModel } from "../../../shared/models.ts";
import { folderIdFrom, type ProfileFolder } from "../../../shared/profile.ts";
import { slugId } from "../../../shared/settings.ts";
import { type ProfileDb, type ProfileDbs, transaction } from "../../db/profileDb.ts";
import { freePath, movePath, resolveInside } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { ThumbCache } from "../../lib/thumbs.ts";
import type { ProfileService } from "../profiles.ts";
import type { SettingsService } from "../settings.ts";
import { modelLabel } from "../workflows/summary.ts";
import { type IndexRow, isDir, moveSidecar, readForIndex, readSidecar, walk } from "./files.ts";

export const THUMB_MAX = 640;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const BATCH = 100;

export interface GalleryDeps {
  profiles: ProfileService;
  /** The profile databases (shared with downloads and model lookups). */
  dbs: ProfileDbs;
  settings: SettingsService;
  runtimeDir: string;
  publish: (topic: LiveTopic | null, msg: ServerMessage) => void;
  /** Whether a workflow id still exists in the open profile. */
  workflowExists: (id: string) => Promise<boolean>;
  /** The models folder's models (a Civitai image's versions are matched against them). */
  localModels: () => Promise<LocalModel[]>;
}

export interface LibraryRoot {
  id: string;
  name: string;
  path: string;
  builtin: boolean;
}

interface ImageRow {
  id: number;
  library: string;
  path: string;
  name: string;
  folder: string;
  size: number;
  mtime: number;
  width: number;
  height: number;
  model: string | null;
  media: string;
  duration: number | null;
  favorite: number;
  rating: number;
}

interface Open {
  profileId: string;
  pdb: ProfileDb;
  thumbs: ThumbCache;
  /** Prepared statements for the hot paths (indexing), per connection. */
  statements: Map<string, StatementSync>;
  /**
   * Images trashed since the running sync started (`trashKey`). A sync batch reads headers
   * between its stat and its write; an image trashed meanwhile must not come back.
   */
  trashed: Set<string>;
}

/** Library ids are slugs, so the first "/" ends the id. */
const trashKey = (library: string, rel: string) => `${library}/${rel}`;

const idle = (): SyncState => ({
  running: false,
  done: 0,
  total: 0,
  added: 0,
  removed: 0,
  finishedAt: null,
  error: null,
});

const toRel = (p: string) => p.split(path.sep).join("/");
const fromRel = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/** FTS5 query for the terms trigram search can match (3+ characters), or null. */
export function ftsQuery(terms: string[]): string | null {
  const long = terms.filter((t) => [...t].length >= 3);
  return long.length ? long.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ") : null;
}

const SELECT = `
  SELECT i.id, i.library, i.path, i.name, i.folder, i.size, i.mtime, i.width, i.height, i.model,
         i.media, i.duration,
         COALESCE(m.favorite, 0) AS favorite, COALESCE(m.rating, 0) AS rating
  FROM images i LEFT JOIN marks m ON m.library = i.library AND m.path = i.path`;

/** Not a script grid: Blombo's `grids` folders (`<workflow>/grids/<day>`, `<day>/grids` before) and A1111's `txt2img-grids`. */
const NOT_GRID = `('/' || i.folder || '/') NOT LIKE '%/grids/%' AND ('/' || i.folder || '/') NOT LIKE '%-grids/%'`;
/**
 * Not saved by a stopped run: not in an `interrupted` folder (where they're moved), and not marked
 * (a mark older than the file is for an earlier file there).
 */
const NOT_INTERRUPTED = `('/' || i.folder || '/') NOT LIKE '%/interrupted/%' AND NOT EXISTS (
  SELECT 1 FROM interrupted x WHERE x.library = i.library AND x.path = i.path AND x.marked_at >= i.mtime)`;

/**
 * A shuffled order that stays the same for one seed: the id through a hash in integer math
 * (squaring mod 2^31 - 1 stays under 2^62, so SQLite never falls back to floats).
 */
export function shuffleKey(seed: number): string {
  const h = `((i.id * 2654435761 + ${Math.trunc(seed)}) % 2147483647)`;
  return `((${h} * ${h} + ${Math.trunc(seed)}) % 2147483647)`;
}

const MEDIA = ["image", "animated", "video", "audio"] as const;

/** Each origin as a condition on `images i` (the import folders, as `originOf` reads them). */
const CIVITAI_ROWS = "(i.path LIKE 'civitai/%')";
const ORIGIN_SQL: Record<ImageOrigin, string> = {
  civitai: CIVITAI_ROWS,
  imported: "(i.path LIKE 'imported/%')",
  generated: "(i.path NOT LIKE 'civitai/%' AND i.path NOT LIKE 'imported/%')",
};

/** How a local model is named in the gallery's filters, and which filter it's in. */
type LocalVersion = { label: string; kind: "model" | "lora" };

/** Conditions appended to a WHERE clause. */
const and = (conditions: string[]) => conditions.map((c) => ` AND ${c}`).join("");

/** A ComfyUI output ref as a path inside the output folder. */
const refPath = (ref: { filename: string; subfolder: string }) =>
  [ref.subfolder, ref.filename].filter(Boolean).join("/").replace(/\\/g, "/");

export class GalleryService {
  private readonly deps: GalleryDeps;
  private current: Open | null = null;
  private syncState: SyncState = idle();
  private syncRun: { abort: AbortController; done: Promise<void> } | null = null;
  private syncAgain = false;
  private lastProgress = 0;

  constructor(deps: GalleryDeps) {
    this.deps = deps;
  }

  /* ── profile ─────────────────────────────────────────────────────────── */

  /** Point the gallery at a profile (closes the previous profile's database). */
  async open(profileId: string): Promise<void> {
    if (this.current?.profileId === profileId) return;
    const run = this.syncRun;
    run?.abort.abort();
    await run?.done.catch(() => undefined);
    this.openNow(profileId);
  }

  /** Switch databases right away (a running sync sees it and stops). */
  private openNow(profileId: string): Open {
    this.syncRun?.abort.abort();
    this.deps.dbs.closeOthers(profileId);
    const pdb = this.deps.dbs.get(profileId);
    const thumbs = new ThumbCache(
      path.join(this.deps.runtimeDir, "cache", profileId, "thumbs", "gallery"),
    );
    this.current = { profileId, pdb, thumbs, statements: new Map(), trashed: new Set() };
    this.syncState = idle();
    return this.current;
  }

  async close(): Promise<void> {
    const run = this.syncRun;
    if (run) {
      run.abort.abort();
      await run.done.catch(() => undefined);
    }
    if (this.current) this.deps.dbs.close(this.current.profileId);
    this.current = null;
  }

  /**
   * The open profile's database. Requests can arrive before the "profile opened" reaction has
   * run, so it opens on demand for whichever profile is active.
   */
  private need(): Open {
    const active = this.deps.profiles.active;
    if (!active) throw new HttpError(409, "Open a profile first.", "no_profile");
    if (this.current?.profileId === active) return this.current;
    return this.openNow(active);
  }

  /** The main output folder's id, as of the last `libraries()` read. */
  private mainLibrary: string = OUTPUTS_LIBRARY;

  get searchMode(): "fts" | "like" {
    return this.current?.pdb.fts ? "fts" : "like";
  }

  /** The profile's output folders; the first (main) is where generated images land. */
  async libraries(): Promise<LibraryRoot[]> {
    const { profileId } = this.need();
    const profile = await this.deps.profiles.get(profileId);
    const out: LibraryRoot[] = profile.folders.outputs.map((f, i) => ({
      id: f.id,
      name: f.name,
      path: f.path.trim(),
      builtin: i === 0,
    }));
    this.mainLibrary = out[0]?.id ?? OUTPUTS_LIBRARY;
    return out;
  }

  private async library(id: string): Promise<LibraryRoot> {
    const lib = (await this.libraries()).find((l) => l.id === id);
    if (!lib) throw new HttpError(404, "That library isn't in this profile anymore.", "no_library");
    return lib;
  }

  /* ── sync ────────────────────────────────────────────────────────────── */

  get sync(): SyncState {
    return this.syncState;
  }

  /** Start a background sync (all libraries, or one). A sync already running is restarted. */
  startSync(): void {
    if (!this.deps.profiles.active) return;
    this.need();
    if (this.syncRun) {
      this.syncAgain = true;
      return;
    }
    const abort = new AbortController();
    const done = this.runSync(abort.signal).finally(() => {
      this.syncRun = null;
      if (this.syncAgain && !abort.signal.aborted) {
        this.syncAgain = false;
        this.startSync();
      }
    });
    this.syncRun = { abort, done };
  }

  /** Wait for the running sync (tests, and the first open). */
  async whenSynced(): Promise<void> {
    while (this.syncRun) await this.syncRun.done.catch(() => undefined);
  }

  private setSync(patch: Partial<SyncState>, force = false): void {
    this.syncState = { ...this.syncState, ...patch };
    const now = Date.now();
    if (!force && now - this.lastProgress < 250) return;
    this.lastProgress = now;
    this.deps.publish("gallery", { t: "gallery.sync", sync: this.syncState });
  }

  private async runSync(signal: AbortSignal): Promise<void> {
    const open = this.need();
    // Anything trashed before this sync walks the folders is already gone from them.
    open.trashed.clear();
    this.setSync({ ...idle(), running: true }, true);
    let added = 0;
    let removed = 0;
    try {
      const libs = await this.libraries();
      // Rows of libraries that were removed (e.g. while a sync was adding to them).
      const known = new Set(libs.map((l) => l.id));
      for (const { library } of open.pdb.db
        .prepare("SELECT DISTINCT library FROM images")
        .all() as Array<{ library: string }>)
        if (!known.has(library)) this.dropLibraryRows(open, library);
      for (const lib of libs) {
        if (signal.aborted) return;
        const r = await this.syncLibrary(open, lib, signal);
        added += r.added;
        removed += r.removed;
      }
      this.setSync({ running: false, added, removed, finishedAt: Date.now(), error: null }, true);
    } catch (error) {
      if (signal.aborted) return;
      console.error("Gallery sync failed:", error);
      this.setSync(
        {
          running: false,
          finishedAt: Date.now(),
          error: `Couldn't finish reading the image folders: ${error instanceof Error ? error.message : error}`,
        },
        true,
      );
    }
    if (added || removed) this.deps.publish("gallery", { t: "gallery.changed" });
  }

  private async syncLibrary(
    open: Open,
    lib: LibraryRoot,
    signal: AbortSignal,
  ): Promise<{ added: number; removed: number }> {
    if (!lib.path || !(await isDir(lib.path))) return { added: 0, removed: 0 };
    const files: string[] = [];
    await walk(lib.path, files, signal);
    if (signal.aborted) return { added: 0, removed: 0 };

    const { db } = open.pdb;
    const known = new Map<string, { size: number; mtime: number }>();
    for (const row of db
      .prepare("SELECT path, size, mtime FROM images WHERE library = ?")
      .all(lib.id) as Array<{ path: string; size: number; mtime: number }>)
      known.set(row.path, { size: row.size, mtime: row.mtime });

    this.setSync({ total: this.syncState.total + files.length }, true);
    let added = 0;
    const seen = new Set<string>();

    // A batch at a time: stats and header reads run in parallel (indexing is I/O-bound) and
    // each batch is written in one transaction.
    for (let i = 0; i < files.length; i += BATCH) {
      if (signal.aborted || this.current !== open) return { added, removed: 0 };
      const batch = files.slice(i, i + BATCH);
      const stats = await Promise.all(batch.map((abs) => fs.stat(abs).catch(() => null)));
      const changed: Array<{ rel: string; abs: string; stat: Stats }> = [];
      batch.forEach((abs, j) => {
        const rel = toRel(path.relative(lib.path, abs));
        seen.add(rel);
        const stat = stats[j];
        if (!stat) return;
        const prev = known.get(rel);
        if (!prev || prev.size !== stat.size || Math.abs(prev.mtime - stat.mtimeMs) > 1)
          changed.push({ rel, abs, stat });
      });
      if (changed.length) {
        const parsed = await Promise.all(
          changed.map((f) =>
            readForIndex(f.abs, f.rel).then(
              (row) => ({ ...f, row }),
              // Unreadable or not really an image: leave it out of the index.
              () => null,
            ),
          ),
        );
        if (signal.aborted || this.current !== open) return { added, removed: 0 };
        const rows = parsed
          .filter((p) => p !== null)
          .filter((p) => !open.trashed.has(trashKey(lib.id, p.rel)));
        transaction(db, () => {
          for (const p of rows) this.upsert(open, lib.id, p.rel, p.stat, p.row);
        });
        added += rows.length;
      }
      this.setSync({ done: this.syncState.done + batch.length });
      await yieldToLoop();
    }

    // Rows for files that are gone (the folder was readable, so absence is real).
    const gone = [...known.keys()].filter((rel) => !seen.has(rel));
    if (gone.length)
      transaction(db, () => {
        const find = db.prepare("SELECT id FROM images WHERE library = ? AND path = ?");
        for (const rel of gone) {
          const row = find.get(lib.id, rel) as { id: number } | undefined;
          if (row) this.deleteRow(open, row.id);
        }
      });
    return { added, removed: gone.length };
  }

  /** A prepared statement, made once per connection (indexing runs these thousands of times). */
  private stmt(open: Open, sql: string): StatementSync {
    let statement = open.statements.get(sql);
    if (!statement) {
      statement = open.pdb.db.prepare(sql);
      open.statements.set(sql, statement);
    }
    return statement;
  }

  private upsert(open: Open, library: string, rel: string, stat: Stats, row: IndexRow): number {
    const { fts } = open.pdb;
    const name = rel.split("/").pop() ?? rel;
    const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const search = searchText(rel, row.summary).toLowerCase();
    const result = this.stmt(
      open,
      `INSERT INTO images (library, path, name, folder, size, mtime, width, height, source, model,
                           summary, settings, has_workflow, search, indexed_at, media, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (library, path) DO UPDATE SET
         name = excluded.name, folder = excluded.folder, size = excluded.size,
         mtime = excluded.mtime, width = excluded.width, height = excluded.height,
         source = excluded.source, model = excluded.model, summary = excluded.summary,
         settings = excluded.settings, has_workflow = excluded.has_workflow,
         search = excluded.search, indexed_at = excluded.indexed_at,
         media = excluded.media, duration = excluded.duration
       RETURNING id`,
    ).get(
      library,
      rel,
      name,
      folder,
      stat.size,
      stat.mtimeMs,
      row.width,
      row.height,
      row.summary.source,
      row.summary.model,
      JSON.stringify(row.summary),
      JSON.stringify(row.settings),
      row.hasWorkflow ? 1 : 0,
      search,
      Date.now(),
      row.media,
      row.duration,
    ) as { id: number };
    const id = Number(result.id);
    this.stmt(open, "DELETE FROM image_loras WHERE image_id = ?").run(id);
    const lora = this.stmt(
      open,
      "INSERT INTO image_loras (image_id, name, strength) VALUES (?, ?, ?)",
    );
    // A Civitai image's LoRAs are found through its versions (the poster's names aren't yours).
    if (originOf(rel) !== "civitai")
      for (const l of row.summary.loras) lora.run(id, l.name, l.strength);
    this.stmt(open, "DELETE FROM image_versions WHERE image_id = ?").run(id);
    const version = this.stmt(
      open,
      "INSERT INTO image_versions (image_id, version_id) VALUES (?, ?)",
    );
    for (const v of row.versions) version.run(id, v);
    if (fts) {
      this.stmt(open, "DELETE FROM images_fts WHERE rowid = ?").run(id);
      this.stmt(open, "INSERT INTO images_fts (rowid, search) VALUES (?, ?)").run(id, search);
    }
    return id;
  }

  private deleteRow(open: Open, id: number): void {
    this.stmt(open, "DELETE FROM images WHERE id = ?").run(id);
    if (open.pdb.fts) this.stmt(open, "DELETE FROM images_fts WHERE rowid = ?").run(id);
  }

  /**
   * Index an image a job just wrote (ComfyUI's output folder ref) when it's inside the main
   * output folder. Returns the gallery row, or null when the file isn't there (external ComfyUI).
   */
  async ingestOutput(ref: {
    filename: string;
    subfolder: string;
    type: string;
  }): Promise<GalleryImage | null> {
    if (ref.type !== "output" || !this.deps.profiles.active) return null;
    return this.ingest(refPath(ref));
  }

  /** The main output folder, where generated and added images land. */
  async mainFolder(): Promise<string> {
    const lib = (await this.libraries())[0];
    if (!lib?.path)
      throw new HttpError(409, "Set an outputs folder in Settings → Folders first.", "no_outputs");
    return lib.path;
  }

  /**
   * Index a file in the main output folder now (`rel` inside it) and announce it. Null when the
   * file isn't there.
   */
  async ingest(rel: string): Promise<GalleryImage | null> {
    const open = this.need();
    const lib = (await this.libraries())[0];
    if (!lib?.path) return null;
    if (rel.split("/").some((p) => p === ".." || p === "")) return null;
    const abs = fromRel(lib.path, rel);
    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      return null;
    }
    const row = await readForIndex(abs, rel);
    const shown = and(await this.shown());
    if (this.current !== open) return null;
    const id = this.upsert(open, lib.id, rel, stat, row);
    const image = this.get(id);
    // A grid the settings leave out is indexed but not announced.
    const visible = open.pdb.db.prepare(`SELECT 1 FROM images i WHERE i.id = ?${shown}`).get(id);
    if (image && visible) this.deps.publish("gallery", { t: "gallery.added", image });
    return image;
  }

  /**
   * A run was stopped: the images it saved in the main output folder move into their workflow's
   * `interrupted/` folder (`interruptedFolder`), and `refs` are updated in place so the job and
   * its log point where they are now. An image in another layout (older days, a prefix set in
   * the graph), or one that can't be moved, is marked where it is instead (the `interrupted`
   * table). Either way the gallery can leave them out (`excludeInterrupted`). Lists refetch.
   */
  async markInterrupted(
    profileId: string,
    refs: Array<{ filename: string; subfolder: string; type: string }>,
  ): Promise<void> {
    const outputs = refs.filter((r) => r.type === "output");
    const open = this.current;
    if (!outputs.length || open?.profileId !== profileId) return;
    const lib = (await this.libraries())[0];
    if (!lib || this.current !== open) return;
    const { db } = open.pdb;
    const mark = db.prepare(
      "INSERT OR REPLACE INTO interrupted (library, path, marked_at) VALUES (?, ?, ?)",
    );
    const find = db.prepare("SELECT id FROM images WHERE library = ? AND path = ?");
    for (const ref of outputs) {
      const rel = refPath(ref);
      const to = lib.path ? interruptedFolder(ref.subfolder) : null;
      if (to && !rel.split("/").includes("..") && !ref.filename.includes("/")) {
        try {
          const dest = await freePath(fromRel(lib.path, `${to}/${ref.filename}`));
          await movePath(fromRel(lib.path, rel), dest);
          const old = find.get(lib.id, rel) as { id: number } | undefined;
          if (old) this.deleteRow(open, Number(old.id));
          ref.subfolder = to;
          ref.filename = path.basename(dest);
          await this.ingest(refPath(ref)).catch(() => null);
          continue;
        } catch {
          // Locked or gone: mark it where it is.
        }
      }
      mark.run(lib.id, rel, Date.now());
    }
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  /** What the gallery settings let through, as conditions on `images i`. */
  private async shown(): Promise<string[]> {
    const { gallery } = await this.deps.settings.get(this.need().profileId);
    return [
      ...(gallery.excludeGrids ? [NOT_GRID] : []),
      ...(gallery.excludeInterrupted ? [NOT_INTERRUPTED] : []),
    ];
  }

  /**
   * Gallery rows for ComfyUI output refs (the job log's first images), without touching files.
   * Refs outside the main output folder, or not indexed (yet), are left out.
   */
  findOutputs(
    refs: Array<{ filename: string; subfolder: string; type: string }>,
  ): Map<string, GalleryImage> {
    const out = new Map<string, GalleryImage>();
    if (!this.current) return out;
    const { db } = this.current.pdb;
    const find = db.prepare(`${SELECT} WHERE i.library = ? AND i.path = ?`);
    for (const ref of refs) {
      if (ref.type !== "output") continue;
      const rel = refPath(ref);
      const row = find.get(this.mainLibrary, rel) as ImageRow | undefined;
      if (row) out.set(rel, this.toImage(row));
    }
    return out;
  }

  /* ── queries ─────────────────────────────────────────────────────────── */

  private toImage(r: ImageRow): GalleryImage {
    return {
      id: Number(r.id),
      library: r.library,
      path: r.path,
      name: r.name,
      width: Number(r.width),
      height: Number(r.height),
      size: Number(r.size),
      mtime: Number(r.mtime),
      favorite: Boolean(r.favorite),
      rating: Number(r.rating ?? 0),
      model: r.model,
      thumb: thumbUrl(Number(r.id), Number(r.size), Number(r.mtime)),
      origin: originOf(r.path),
      media: (MEDIA as readonly string[]).includes(r.media) ? (r.media as MediaKind) : "image",
      duration: r.duration === null || r.duration === undefined ? null : Number(r.duration),
    };
  }

  /**
   * Local models that are Civitai versions, by version id: what a Civitai image's versions
   * stand for here. Empty when the models folder can't be read.
   */
  private async localVersions(): Promise<Map<number, LocalVersion>> {
    const out = new Map<number, LocalVersion>();
    // No Civitai images: no need to read the models folder.
    if (!this.need().pdb.db.prepare("SELECT 1 FROM image_versions LIMIT 1").get()) return out;
    let models: LocalModel[];
    try {
      models = await this.deps.localModels();
    } catch {
      return out;
    }
    for (const m of models) {
      const kind =
        m.kind === "loras"
          ? "lora"
          : m.kind === "checkpoints" || m.kind === "diffusion_models"
            ? "model"
            : null;
      if (m.civitai && kind)
        out.set(m.civitai.versionId, { label: modelLabel(m.id) ?? m.id, kind });
    }
    return out;
  }

  /** A model or LoRA filter's condition on Civitai images: the versions that are it here. */
  private async versionMatch(kind: LocalVersion["kind"], label: string): Promise<string> {
    const ids = [...(await this.localVersions())]
      .filter(([, v]) => v.kind === kind && v.label === label)
      .map(([id]) => Math.trunc(id));
    return ids.length
      ? ` OR EXISTS (SELECT 1 FROM image_versions v WHERE v.image_id = i.id AND v.version_id IN (${ids.join(",")}))`
      : "";
  }

  get(id: number): GalleryImage | null {
    const row = this.need().pdb.db.prepare(`${SELECT} WHERE i.id = ?`).get(id) as
      | ImageRow
      | undefined;
    return row ? this.toImage(row) : null;
  }

  async query(q: GalleryQuery): Promise<GalleryPage> {
    const where = await this.shown();
    const { db, fts } = this.need().pdb;
    const params: Array<string | number> = [];
    if (q.library !== "all") {
      where.push("i.library = ?");
      params.push(q.library);
    }
    if (q.favorites) where.push("m.favorite = 1");
    if (q.origins.length < IMAGE_ORIGINS.length)
      where.push(q.origins.length ? `(${q.origins.map((o) => ORIGIN_SQL[o]).join(" OR ")})` : "0");
    if (q.model) {
      where.push(
        `((i.model = ? AND NOT ${CIVITAI_ROWS})${await this.versionMatch("model", q.model)})`,
      );
      params.push(q.model);
    }
    if (q.lora) {
      where.push(
        `(EXISTS (SELECT 1 FROM image_loras l WHERE l.image_id = i.id AND l.name = ?)${await this.versionMatch("lora", q.lora)})`,
      );
      params.push(q.lora);
    }
    if (q.since !== undefined) {
      where.push("i.mtime >= ?");
      params.push(q.since);
    }
    if (q.rating > 0) {
      where.push("COALESCE(m.rating, 0) >= ?");
      params.push(q.rating);
    }
    if (q.tag) {
      where.push(
        "EXISTS (SELECT 1 FROM image_tags t WHERE t.library = i.library AND t.path = i.path AND t.tag = ?)",
      );
      params.push(q.tag.toLowerCase());
    }
    if (q.collection) {
      where.push(
        "EXISTS (SELECT 1 FROM collection_items c WHERE c.library = i.library AND c.path = i.path AND c.collection_id = ?)",
      );
      params.push(q.collection);
    }
    const terms = q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
    const match = fts ? ftsQuery(terms) : null;
    if (match) {
      where.push("i.id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?)");
      params.push(match);
    }
    for (const t of terms)
      if (!match || [...t].length < 3) {
        where.push("i.search LIKE ? ESCAPE '\\'");
        params.push(`%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order =
      q.sort === "oldest"
        ? "i.mtime ASC, i.id ASC"
        : q.sort === "name"
          ? "i.name COLLATE NOCASE ASC, i.id ASC"
          : q.sort === "rating"
            ? "COALESCE(m.rating, 0) DESC, i.mtime DESC, i.id DESC"
            : q.sort === "random"
              ? `${shuffleKey(q.seed)}, i.id`
              : "i.mtime DESC, i.id DESC";
    const rows = db
      .prepare(`${SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, q.limit, q.offset) as unknown as ImageRow[];
    const total = db
      .prepare(
        `SELECT COUNT(*) AS n FROM images i LEFT JOIN marks m ON m.library = i.library AND m.path = i.path ${clause}`,
      )
      .get(...params) as { n: number };
    return { items: rows.map((r) => this.toImage(r)), total: Number(total.n), offset: q.offset };
  }

  /** What other gallery modules (home.ts) read with: the shown-images condition and the rows. */
  async reader(): Promise<{
    db: ProfileDb["db"];
    /** ` AND …` conditions for the images the lists show. */
    shown: string;
    select: string;
    toImage: (row: unknown) => GalleryImage;
  }> {
    const shown = and(await this.shown());
    return {
      db: this.need().pdb.db,
      shown,
      select: SELECT,
      toImage: (row) => this.toImage(row as ImageRow),
    };
  }

  async facets(library: string): Promise<GalleryFacets> {
    const shown = and(await this.shown());
    const { db } = this.need().pdb;
    const lib = `${library === "all" ? "" : "AND i.library = ?"}${shown}`;
    const args = library === "all" ? [] : [library];
    const models = db
      .prepare(
        `SELECT model AS name, COUNT(*) AS count FROM images i
         WHERE model IS NOT NULL AND NOT ${CIVITAI_ROWS} ${lib} GROUP BY model`,
      )
      .all(...args) as Array<{ name: string; count: number }>;
    const loras = db
      .prepare(
        `SELECT l.name AS name, COUNT(DISTINCT l.image_id) AS count
         FROM image_loras l JOIN images i ON i.id = l.image_id WHERE 1 = 1 ${lib}
         GROUP BY l.name`,
      )
      .all(...args) as Array<{ name: string; count: number }>;
    const counts = {
      model: new Map(models.map((r) => [r.name, Number(r.count)])),
      lora: new Map(loras.map((r) => [r.name, Number(r.count)])),
    };
    // Civitai images count for the models and LoRAs here that made them.
    const local = await this.localVersions();
    if (local.size)
      for (const r of db
        .prepare(
          `SELECT v.version_id AS id, COUNT(DISTINCT v.image_id) AS count
           FROM image_versions v JOIN images i ON i.id = v.image_id WHERE 1 = 1 ${lib}
           GROUP BY v.version_id`,
        )
        .all(...args) as Array<{ id: number; count: number }>) {
        const m = local.get(Number(r.id));
        if (m) counts[m.kind].set(m.label, (counts[m.kind].get(m.label) ?? 0) + Number(r.count));
      }
    const top = (map: Map<string, number>) =>
      [...map]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 60);
    return { models: top(counts.model), loras: top(counts.lora) };
  }

  async overview(): Promise<GalleryOverview> {
    const shown = and(await this.shown());
    const { db } = this.need().pdb;
    const count = (sql: string, ...args: Array<string | number>) =>
      Number((db.prepare(sql).get(...args) as { n: number }).n);
    const libraries: LibraryInfo[] = [];
    for (const lib of await this.libraries()) {
      const cover = db
        .prepare(`${SELECT} WHERE i.library = ?${shown} ORDER BY i.mtime DESC LIMIT 1`)
        .get(lib.id) as ImageRow | undefined;
      libraries.push({
        id: lib.id,
        name: lib.name,
        path: lib.path,
        builtin: lib.builtin,
        exists: Boolean(lib.path) && (await isDir(lib.path)),
        count: count(`SELECT COUNT(*) AS n FROM images i WHERE i.library = ?${shown}`, lib.id),
        cover: cover ? this.toImage(cover).thumb : null,
      });
    }
    let featured = db
      .prepare(`${SELECT} WHERE m.favorite = 1${shown} ORDER BY i.mtime DESC LIMIT 5`)
      .all() as unknown as ImageRow[];
    if (!featured.length)
      featured = db
        .prepare(`${SELECT} WHERE 1 = 1${shown} ORDER BY i.mtime DESC LIMIT 1`)
        .all() as unknown as ImageRow[];
    // Images per local calendar day, last 7 days (today last).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const perDay = Array.from({ length: 7 }, (_, i) => {
      const start = new Date(today);
      start.setDate(today.getDate() - (6 - i));
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return count(
        `SELECT COUNT(*) AS n FROM images i WHERE i.mtime >= ? AND i.mtime < ?${shown}`,
        start.getTime(),
        end.getTime(),
      );
    });
    return {
      libraries,
      perDay,
      counts: {
        all: count(`SELECT COUNT(*) AS n FROM images i WHERE 1 = 1${shown}`),
        favorites: count(
          `SELECT COUNT(*) AS n FROM images i JOIN marks m ON m.library = i.library AND m.path = i.path WHERE m.favorite = 1${shown}`,
        ),
        week: count(
          `SELECT COUNT(*) AS n FROM images i WHERE i.mtime >= ?${shown}`,
          Date.now() - WEEK_MS,
        ),
        trash: count("SELECT COUNT(*) AS n FROM trash"),
        imported: count(`SELECT COUNT(*) AS n FROM images i WHERE ${ORIGIN_SQL.imported}${shown}`),
        civitai: count(`SELECT COUNT(*) AS n FROM images i WHERE ${ORIGIN_SQL.civitai}${shown}`),
      },
      featured: featured.map((r) => this.toImage(r)),
      sync: this.syncState,
      search: this.searchMode,
    };
  }

  async details(id: number): Promise<ImageDetails> {
    const { db } = this.need().pdb;
    const image = this.get(id);
    if (!image) throw new HttpError(404, "That image isn't in the gallery anymore.", "no_image");
    const raw = db
      .prepare("SELECT summary, settings, has_workflow FROM images WHERE id = ?")
      .get(id) as { summary: string; settings: string; has_workflow: number };
    const summary = ImageSummary.safeParse(safeJson(raw.summary));
    const settings = ImageSettings.safeParse(safeJson(raw.settings));
    const s = settings.success
      ? settings.data
      : { workflowId: null, values: null, roles: {} as Record<string, unknown> };
    if (s.workflowId && !(await this.deps.workflowExists(s.workflowId))) s.workflowId = null;
    const tags = db
      .prepare("SELECT tag FROM image_tags WHERE library = ? AND path = ? ORDER BY tag")
      .all(image.library, image.path) as Array<{ tag: string }>;
    const collections = db
      .prepare("SELECT collection_id AS id FROM collection_items WHERE library = ? AND path = ?")
      .all(image.library, image.path) as Array<{ id: string }>;
    const sidecar = image.origin === "civitai" ? await readSidecar(await this.filePath(id)) : null;
    return {
      ...image,
      tags: tags.map((t) => t.tag),
      collections: collections.map((c) => c.id),
      summary: summary.success ? summary.data : { ...EMPTY_SUMMARY },
      settings: s,
      hasWorkflow: Boolean(raw.has_workflow),
      file: fileUrl(image),
      civitai: sidecar
        ? {
            by: sidecar.by,
            page:
              sidecar.imageId && sidecar.site ? `${sidecar.site}/images/${sidecar.imageId}` : null,
            versionId: sidecar.versionId,
          }
        : null,
    };
  }

  /** Absolute path of an indexed image. */
  async filePath(id: number): Promise<string> {
    const row = this.need()
      .pdb.db.prepare("SELECT library, path FROM images WHERE id = ?")
      .get(id) as { library: string; path: string } | undefined;
    if (!row) throw new HttpError(404, "That image isn't in the gallery anymore.", "no_image");
    const lib = await this.library(row.library);
    return fromRel(lib.path, row.path);
  }

  /** An image's thumbnail; `animated` asks for an animation's moving one. */
  async thumbFile(id: number, animated = false): Promise<string> {
    const open = this.need();
    const image = this.get(id);
    if (!image) throw new HttpError(404, "That image isn't in the gallery anymore.", "no_image");
    const abs = await this.filePath(id);
    const mode =
      image.media === "video" || image.media === "audio"
        ? image.media
        : animated && image.media === "animated"
          ? "animated"
          : "still";
    return open.thumbs.get(abs, `${image.size}-${image.mtime}`, THUMB_MAX, mode);
  }

  /* ── favorites ───────────────────────────────────────────────────────── */

  setFavorite(ids: number[], favorite: boolean): void {
    const { db } = this.need().pdb;
    transaction(db, () => {
      const find = db.prepare("SELECT library, path FROM images WHERE id = ?");
      const set = db.prepare(
        `INSERT INTO marks (library, path, favorite) VALUES (?, ?, ?)
         ON CONFLICT (library, path) DO UPDATE SET favorite = excluded.favorite`,
      );
      for (const id of ids) {
        const row = find.get(id) as { library: string; path: string } | undefined;
        if (row) set.run(row.library, row.path, favorite ? 1 : 0);
      }
    });
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  /* ── ratings, tags, collections ─────────────────────────────────────── */

  private marksOf(db: ProfileDb["db"], library: string, rel: string, rating: number) {
    const tags = db
      .prepare("SELECT tag FROM image_tags WHERE library = ? AND path = ?")
      .all(library, rel) as Array<{ tag: string }>;
    const collections = db
      .prepare("SELECT collection_id AS id FROM collection_items WHERE library = ? AND path = ?")
      .all(library, rel) as Array<{ id: string }>;
    return { rating, tags: tags.map((t) => t.tag), collections: collections.map((c) => c.id) };
  }

  private rowsFor(ids: number[]): Array<{ library: string; path: string }> {
    const find = this.need().pdb.db.prepare("SELECT library, path FROM images WHERE id = ?");
    return ids.flatMap((id) => {
      const row = find.get(id) as { library: string; path: string } | undefined;
      return row ? [row] : [];
    });
  }

  setRating(ids: number[], rating: number): void {
    const { db } = this.need().pdb;
    const rows = this.rowsFor(ids);
    transaction(db, () => {
      const set = db.prepare(
        `INSERT INTO marks (library, path, favorite, rating) VALUES (?, ?, 0, ?)
         ON CONFLICT (library, path) DO UPDATE SET rating = excluded.rating`,
      );
      for (const r of rows) set.run(r.library, r.path, rating);
    });
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  setTags(ids: number[], add: string[], remove: string[]): void {
    const { db } = this.need().pdb;
    const rows = this.rowsFor(ids);
    transaction(db, () => {
      const ins = db.prepare(
        "INSERT OR IGNORE INTO image_tags (library, path, tag) VALUES (?, ?, ?)",
      );
      const del = db.prepare("DELETE FROM image_tags WHERE library = ? AND path = ? AND tag = ?");
      for (const r of rows) {
        for (const t of remove) del.run(r.library, r.path, t);
        for (const t of add) ins.run(r.library, r.path, t);
      }
    });
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  /** Your tags on images that are in the index, most used first. */
  tags(): TagCount[] {
    const rows = this.need()
      .pdb.db.prepare(
        `SELECT t.tag AS tag, COUNT(*) AS count FROM image_tags t
         JOIN images i ON i.library = t.library AND i.path = t.path
         GROUP BY t.tag ORDER BY count DESC, t.tag LIMIT 500`,
      )
      .all() as Array<{ tag: string; count: number }>;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  collections(): Collection[] {
    const { db } = this.need().pdb;
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.created_at, COUNT(i.id) AS count FROM collections c
         LEFT JOIN collection_items ci ON ci.collection_id = c.id
         LEFT JOIN images i ON i.library = ci.library AND i.path = ci.path
         GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
      )
      .all() as Array<{ id: string; name: string; created_at: number; count: number }>;
    const cover = db.prepare(
      `${SELECT} JOIN collection_items ci ON ci.library = i.library AND ci.path = i.path
       WHERE ci.collection_id = ? ORDER BY ci.added_at DESC LIMIT 1`,
    );
    return rows.map((r) => {
      const c = cover.get(r.id) as ImageRow | undefined;
      return {
        id: r.id,
        name: r.name,
        count: Number(r.count),
        createdAt: Number(r.created_at),
        cover: c ? this.toImage(c).thumb : null,
      };
    });
  }

  createCollection(name: string): Collection {
    const { db } = this.need().pdb;
    const taken = new Set(
      (db.prepare("SELECT id FROM collections").all() as Array<{ id: string }>).map((r) => r.id),
    );
    const base = slugId(name, "collection");
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const at = Date.now();
    db.prepare("INSERT INTO collections (id, name, created_at) VALUES (?, ?, ?)").run(id, name, at);
    this.deps.publish("gallery", { t: "gallery.changed" });
    return { id, name, count: 0, cover: null, createdAt: at };
  }

  renameCollection(id: string, name: string): void {
    const res = this.need()
      .pdb.db.prepare("UPDATE collections SET name = ? WHERE id = ?")
      .run(name, id);
    if (!res.changes)
      throw new HttpError(404, "That collection doesn't exist anymore.", "no_collection");
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  /** Remove a collection. Its images stay where they are. */
  removeCollection(id: string): void {
    const res = this.need().pdb.db.prepare("DELETE FROM collections WHERE id = ?").run(id);
    if (!res.changes) throw new HttpError(404, "That collection is already gone.", "no_collection");
    this.deps.publish("gallery", { t: "gallery.changed" });
  }

  setCollectionItems(id: string, ids: number[], remove: boolean): number {
    const { db } = this.need().pdb;
    if (!db.prepare("SELECT 1 FROM collections WHERE id = ?").get(id))
      throw new HttpError(404, "That collection doesn't exist anymore.", "no_collection");
    const rows = this.rowsFor(ids);
    let n = 0;
    transaction(db, () => {
      const ins = db.prepare(
        "INSERT OR IGNORE INTO collection_items (collection_id, library, path, added_at) VALUES (?, ?, ?, ?)",
      );
      const del = db.prepare(
        "DELETE FROM collection_items WHERE collection_id = ? AND library = ? AND path = ?",
      );
      for (const r of rows)
        n += Number(
          (remove ? del.run(id, r.library, r.path) : ins.run(id, r.library, r.path, Date.now()))
            .changes,
        );
    });
    this.deps.publish("gallery", { t: "gallery.changed" });
    return n;
  }

  /* ── trash ───────────────────────────────────────────────────────────── */

  private trashDir(): string {
    return path.join(this.deps.profiles.dir(this.need().profileId), "trash", "gallery");
  }

  /** Move images into the profile's trash. Returns the trash ids (for undo). */
  async trash(ids: number[]): Promise<string[]> {
    const open = this.need();
    const { db } = open.pdb;
    const moved: string[] = [];
    for (const id of ids) {
      const row = db.prepare(`${SELECT} WHERE i.id = ?`).get(id) as ImageRow | undefined;
      if (!row) continue;
      const lib = await this.library(row.library);
      const abs = fromRel(lib.path, row.path);
      const trashId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
      const dest = path.join(this.trashDir(), trashId, row.name);
      try {
        await movePath(abs, dest);
        await moveSidecar(abs, dest);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          this.deleteRow(open, row.id);
          continue;
        }
        throw new HttpError(
          409,
          `Couldn't move "${row.name}" to the trash: ${error instanceof Error ? error.message : error}. Close any app that has it open and try again.`,
          "trash_failed",
        );
      }
      const extra = this.marksOf(db, row.library, row.path, Number(row.rating ?? 0));
      transaction(db, () => {
        db.prepare(
          `INSERT INTO trash (id, library, path, file, size, width, height, mtime, favorite, trashed_at, extra)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          trashId,
          row.library,
          row.path,
          path.relative(this.trashDir(), dest),
          row.size,
          row.width,
          row.height,
          row.mtime,
          row.favorite,
          Date.now(),
          JSON.stringify(extra),
        );
        db.prepare("DELETE FROM marks WHERE library = ? AND path = ?").run(row.library, row.path);
        db.prepare("DELETE FROM image_tags WHERE library = ? AND path = ?").run(
          row.library,
          row.path,
        );
        db.prepare("DELETE FROM collection_items WHERE library = ? AND path = ?").run(
          row.library,
          row.path,
        );
        this.deleteRow(open, row.id);
        open.trashed.add(trashKey(row.library, row.path));
      });
      moved.push(trashId);
    }
    if (moved.length) this.deps.publish("gallery", { t: "gallery.changed" });
    return moved;
  }

  trashList(): TrashEntry[] {
    const rows = this.need()
      .pdb.db.prepare("SELECT * FROM trash ORDER BY trashed_at DESC")
      .all() as Array<{
      id: string;
      library: string;
      path: string;
      file: string;
      size: number;
      width: number;
      height: number;
      trashed_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      library: r.library,
      path: r.path,
      name: r.path.split("/").pop() ?? r.path,
      width: Number(r.width),
      height: Number(r.height),
      size: Number(r.size),
      trashedAt: Number(r.trashed_at),
      thumb: `/api/gallery/trash/${encodeURIComponent(r.id)}/thumb`,
    }));
  }

  private trashRow(id: string) {
    const row = this.need().pdb.db.prepare("SELECT * FROM trash WHERE id = ?").get(id) as
      | {
          id: string;
          library: string;
          path: string;
          file: string;
          favorite: number;
          size: number;
          mtime: number;
          extra: string | null;
        }
      | undefined;
    if (!row) throw new HttpError(404, "That image isn't in the trash anymore.", "no_trash");
    return row;
  }

  /**
   * The trashed file of a row: always `<trash id>/<name>` inside the trash folder. Anything else
   * (a damaged or imported row) is refused, so restoring or emptying never touches more.
   */
  private trashFile(row: { file: string }): string {
    const parts = row.file.split(/[\\/]/);
    if (parts.length !== 2 || parts.some((p) => !p || p === "." || p === ".."))
      throw new HttpError(409, "That trash entry is damaged; it can't be restored.", "bad_trash");
    return resolveInside(this.trashDir(), parts.join("/"));
  }

  async trashThumbFile(id: string): Promise<string> {
    const row = this.trashRow(id);
    const abs = this.trashFile(row);
    const media = mediaOf(abs);
    return this.need().thumbs.get(
      abs,
      `trash-${row.size}-${row.mtime}`,
      THUMB_MAX,
      media === "video" || media === "audio" ? media : "still",
    );
  }

  /** Put trashed images back where they were (a free name if the spot is taken). */
  async restore(ids: string[]): Promise<number> {
    const open = this.need();
    const { db } = open.pdb;
    let restored = 0;
    for (const id of ids) {
      const row = this.trashRow(id);
      const libs = await this.libraries();
      const lib = libs.find((l) => l.id === row.library) ?? libs[0];
      if (!lib?.path)
        throw new HttpError(
          409,
          "Set an outputs folder in Settings before restoring.",
          "no_outputs",
        );
      const from = this.trashFile(row);
      const to = await freePath(fromRel(lib.path, row.path));
      await movePath(from, to);
      await moveSidecar(from, to);
      await fs.rm(path.dirname(from), { recursive: true, force: true }).catch(() => undefined);
      const rel = toRel(path.relative(lib.path, to));
      const stat = await fs.stat(to);
      this.upsert(open, lib.id, rel, stat, await readForIndex(to, rel));
      const extra = parseExtra(row.extra);
      transaction(db, () => {
        if (row.favorite || extra.rating)
          db.prepare(
            `INSERT INTO marks (library, path, favorite, rating) VALUES (?, ?, ?, ?)
             ON CONFLICT (library, path) DO UPDATE SET favorite = excluded.favorite,
               rating = excluded.rating`,
          ).run(lib.id, rel, row.favorite ? 1 : 0, extra.rating);
        const tag = db.prepare(
          "INSERT OR IGNORE INTO image_tags (library, path, tag) VALUES (?, ?, ?)",
        );
        for (const t of extra.tags) tag.run(lib.id, rel, t);
        const add = db.prepare(
          `INSERT OR IGNORE INTO collection_items (collection_id, library, path, added_at)
           SELECT id, ?, ?, ? FROM collections WHERE id = ?`,
        );
        for (const c of extra.collections) add.run(lib.id, rel, Date.now(), c);
        db.prepare("DELETE FROM trash WHERE id = ?").run(id);
      });
      restored++;
    }
    if (restored) this.deps.publish("gallery", { t: "gallery.changed" });
    return restored;
  }

  /** Permanently delete trashed images (only from Blombo's own trash folder). */
  async emptyTrash(ids?: string[]): Promise<number> {
    const { db } = this.need().pdb;
    const rows = (ids ?? this.trashList().map((t) => t.id)).map((id) => this.trashRow(id));
    for (const row of rows) {
      let dir: string | null = null;
      try {
        dir = path.dirname(this.trashFile(row));
      } catch {
        // A damaged row: drop it, delete nothing.
      }
      if (dir) await fs.rm(dir, { recursive: true, force: true });
      db.prepare("DELETE FROM trash WHERE id = ?").run(row.id);
    }
    if (rows.length) this.deps.publish("gallery", { t: "gallery.changed" });
    return rows.length;
  }

  /* ── libraries ───────────────────────────────────────────────────────── */

  private dropLibraryRows(open: Open, library: string): void {
    const { db } = open.pdb;
    transaction(db, () => {
      const ids = db.prepare("SELECT id FROM images WHERE library = ?").all(library) as Array<{
        id: number;
      }>;
      for (const r of ids) this.deleteRow(open, r.id);
    });
  }

  /** Add an output folder (a secondary one: the gallery shows it, nothing is saved there). */
  async addLibrary(name: string, folder: string): Promise<ProfileFolder> {
    const { profileId } = this.need();
    const abs = path.resolve(folder.trim());
    if (!(await isDir(abs)))
      throw new HttpError(400, "That folder doesn't exist. Pick an existing folder.", "no_folder");
    const made: { folder?: ProfileFolder } = {};
    await this.deps.profiles.updateFolders(profileId, "outputs", (current) => {
      const same = (p: string) => path.resolve(p).toLowerCase() === abs.toLowerCase();
      if (current.some((f) => same(f.path)))
        throw new HttpError(409, "That folder is already in the gallery.", "duplicate");
      made.folder = {
        id: folderIdFrom(
          name,
          current.map((f) => f.id),
          "library",
        ),
        name: name.trim(),
        path: abs,
      };
      return [...current, made.folder];
    });
    return made.folder as ProfileFolder;
  }

  async renameLibrary(id: string, name: string): Promise<void> {
    const { profileId } = this.need();
    await this.deps.profiles.updateFolders(profileId, "outputs", (current) => {
      if (!current.some((f) => f.id === id))
        throw new HttpError(404, "That library isn't in this profile anymore.", "no_library");
      return current.map((f) => (f.id === id ? { ...f, name } : f));
    });
  }

  /** Stop showing a library. Its files are untouched; only the index rows go. */
  async removeLibrary(id: string): Promise<void> {
    const open = this.need();
    await this.deps.profiles.updateFolders(open.profileId, "outputs", (current) => {
      if (current[0]?.id === id)
        throw new HttpError(
          400,
          "That's the main output folder. Change it in Settings → Folders.",
          "main_folder",
        );
      return current.filter((f) => f.id !== id);
    });
    // A sync that's reading this library would add its rows back: stop it first.
    const run = this.syncRun;
    run?.abort.abort();
    await run?.done.catch(() => undefined);
    if (this.current !== open) return;
    this.dropLibraryRows(open, id);
    this.deps.publish("gallery", { t: "gallery.changed" });
    // The profile's "updated" event starts the next sync (context.ts).
  }

  /**
   * An output folder's id changed (same path, new id): its rows, ratings, tags, collection
   * items and trash entries follow it, so nothing loses its place.
   */
  async relabelLibrary(from: string, to: string): Promise<void> {
    const open = this.need();
    const run = this.syncRun;
    run?.abort.abort();
    await run?.done.catch(() => undefined);
    if (this.current !== open) return;
    const { db } = open.pdb;
    transaction(db, () => {
      for (const table of [
        "images",
        "marks",
        "trash",
        "image_tags",
        "collection_items",
        "interrupted",
      ])
        db.prepare(`UPDATE ${table} SET library = ? WHERE library = ?`).run(to, from);
    });
    if (this.mainLibrary === from) this.mainLibrary = to;
    this.deps.publish("gallery", { t: "gallery.changed" });
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

/** Rating, tags and collections an image had when it went to the trash. */
function parseExtra(text: string | null): {
  rating: number;
  tags: string[];
  collections: string[];
} {
  const raw = (text ? safeJson(text) : null) as {
    rating?: unknown;
    tags?: unknown;
    collections?: unknown;
  } | null;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const rating = Number(raw?.rating ?? 0);
  return {
    rating: Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0,
    tags: strings(raw?.tags),
    collections: strings(raw?.collections),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
