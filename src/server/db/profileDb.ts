/**
 * The profile's one SQLite file (ADR-0006): data/profiles/<id>/blombo.sqlite, opened with
 * node:sqlite in WAL mode. It holds rebuildable indexes (the gallery) plus small user marks
 * that must survive a rebuild (favorites, the trash list), each in its own table.
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
