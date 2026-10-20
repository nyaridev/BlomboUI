/**
 * The profile's one SQLite file (ADR-0006): data/profiles/<id>/blombo.sqlite, opened with
 * node:sqlite in WAL mode. It holds rebuildable indexes (the gallery, model hashes and Civitai
 * lookups) plus small user marks and logs that must survive a rebuild (favorites, ratings, your
 * tags and collections, the trash list, download and browse history, the job and error logs),
 * each in its own table. `ProfileDbs` hands every service
 * the same connection, so a profile never has two databases.
 *
 * Migrations are ordered SQL steps tracked with `PRAGMA user_version`. Full-text search uses
 * FTS5 with the trigram tokenizer (substring matches in prompts); when this SQLite lacks it,
 * search falls back to LIKE over the same text.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface ProfileDb {
  db: DatabaseSync;
  /** FTS5 trigram search is available. */
  fts: boolean;
  close(): void;
}

const MIGRATIONS: string[] = [
  // 1: gallery index, marks, trash
  `
  CREATE TABLE images (
    id INTEGER PRIMARY KEY,
    library TEXT NOT NULL,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    folder TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime REAL NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source TEXT NOT NULL,
    model TEXT,
    summary TEXT NOT NULL,
    settings TEXT NOT NULL,
    has_workflow INTEGER NOT NULL DEFAULT 0,
    search TEXT NOT NULL,
    indexed_at REAL NOT NULL,
    UNIQUE (library, path)
  );
  CREATE INDEX images_mtime ON images (mtime DESC);
  CREATE INDEX images_library_mtime ON images (library, mtime DESC);
  CREATE INDEX images_model ON images (model);
  CREATE TABLE image_loras (
    image_id INTEGER NOT NULL REFERENCES images (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    strength REAL
  );
  CREATE INDEX image_loras_name ON image_loras (name);
  CREATE INDEX image_loras_image ON image_loras (image_id);
  CREATE TABLE marks (
    library TEXT NOT NULL,
    path TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (library, path)
  );
  CREATE TABLE trash (
    id TEXT PRIMARY KEY,
    library TEXT NOT NULL,
    path TEXT NOT NULL,
    file TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    mtime REAL NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    trashed_at REAL NOT NULL
  );
  `,
  // 2: downloads, Civitai history, model hashes and lookups
  `
  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    name TEXT NOT NULL,
    dest TEXT NOT NULL,
    kind TEXT,
    size INTEGER,
    received INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    error TEXT,
    created_at REAL NOT NULL,
    started_at REAL,
    finished_at REAL,
    model_id INTEGER,
    version_id INTEGER,
    entry_id TEXT,
    thumb TEXT,
    job TEXT NOT NULL
  );
  CREATE INDEX downloads_created ON downloads (created_at DESC);
  CREATE TABLE civitai_views (
    model_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    creator TEXT,
    image TEXT,
    viewed_at REAL NOT NULL
  );
  CREATE INDEX civitai_views_at ON civitai_views (viewed_at DESC);
  CREATE TABLE civitai_searches (
    query TEXT PRIMARY KEY,
    at REAL NOT NULL
  );
  CREATE TABLE model_hashes (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime REAL NOT NULL,
    sha256 TEXT NOT NULL,
    hashed_at REAL NOT NULL
  );
  CREATE INDEX model_hashes_sha ON model_hashes (sha256);
  CREATE TABLE civitai_lookups (
    sha256 TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    info TEXT,
    fetched_at REAL NOT NULL
  );
  `,
  // 3: tags this profile prompts with (frequent tags in autocomplete)
  `
  CREATE TABLE tag_usage (
    tag TEXT PRIMARY KEY,
    uses INTEGER NOT NULL,
    last_used REAL NOT NULL
  );
  CREATE INDEX tag_usage_uses ON tag_usage (uses DESC);
  `,
  // 4: the job log (with what each run used), the error log, gallery ratings, tags and
  // collections, and favorite models
  `
  CREATE TABLE job_log (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    seed INTEGER,
    width INTEGER,
    height INTEGER,
    images INTEGER NOT NULL,
    created_at REAL NOT NULL,
    started_at REAL,
    finished_at REAL NOT NULL,
    duration_ms REAL,
    model TEXT,
    prompt TEXT,
    negative TEXT,
    values_json TEXT NOT NULL,
    stages_json TEXT,
    timings TEXT NOT NULL,
    error TEXT,
    group_title TEXT,
    first_image TEXT
  );
  CREATE INDEX job_log_finished ON job_log (finished_at DESC);
  CREATE TABLE job_log_uses (
    job_id TEXT NOT NULL REFERENCES job_log (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL
  );
  CREATE INDEX job_log_uses_kind ON job_log_uses (kind, name);
  CREATE INDEX job_log_uses_job ON job_log_uses (job_id);
  CREATE TABLE error_log (
    id TEXT PRIMARY KEY,
    at REAL NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL
  );
  CREATE INDEX error_log_at ON error_log (at DESC);
  ALTER TABLE marks ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE trash ADD COLUMN extra TEXT;
  CREATE TABLE image_tags (
    library TEXT NOT NULL,
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (library, path, tag)
  );
  CREATE INDEX image_tags_tag ON image_tags (tag);
  CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at REAL NOT NULL
  );
  CREATE TABLE collection_items (
    collection_id TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    library TEXT NOT NULL,
    path TEXT NOT NULL,
    added_at REAL NOT NULL,
    PRIMARY KEY (collection_id, library, path)
  );
  CREATE INDEX collection_items_path ON collection_items (library, path);
  CREATE TABLE model_marks (
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, name)
  );
  `,
  // 5: sorting the gallery by name without a full scan (20k+ images)
  `
  CREATE INDEX images_name ON images (name COLLATE NOCASE, id);
  `,
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function ensureFts(db: DatabaseSync): boolean {
  try {
    db.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(search, tokenize = 'trigram')",
    );
    return true;
  } catch {
    return false;
  }
}

export function openProfileDb(file: string): ProfileDb {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 3000");
  migrate(db);
  const fts = ensureFts(db);
  return {
    db,
    fts,
    close: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
    },
  };
}

/** Run `fn` in a transaction. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Open profile databases, one connection per profile, shared by every service (gallery,
 * downloads, model lookups). Services ask for the connection each time they need it rather than
 * keeping it, so switching profiles can close the old one at any moment.
 */
export class ProfileDbs {
  private readonly fileOf: (profileId: string) => string;
  private readonly open = new Map<string, ProfileDb>();

  constructor(fileOf: (profileId: string) => string) {
    this.fileOf = fileOf;
  }

  get(profileId: string): ProfileDb {
    const cached = this.open.get(profileId);
    if (cached) return cached;
    const file = this.fileOf(profileId);
    // A late write for a profile that was just removed must not bring its folder back.
    if (!fs.existsSync(path.dirname(file))) throw new Error(`Profile "${profileId}" is gone.`);
    const pdb = openProfileDb(file);
    this.open.set(profileId, pdb);
    return pdb;
  }

  /** Close every connection except the one for `keep` (the profile that's open). */
  closeOthers(keep: string | null): void {
    for (const [id, pdb] of this.open)
      if (id !== keep) {
        pdb.close();
        this.open.delete(id);
      }
  }

  close(profileId: string): void {
    this.open.get(profileId)?.close();
    this.open.delete(profileId);
  }

  closeAll(): void {
    this.closeOthers(null);
  }
}
