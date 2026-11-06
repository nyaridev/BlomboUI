import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { describeTables, listFiles, toChunk } from "./devinfo.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
});

describe("dev info", () => {
  it("lists the profile folder, folders first, the trash as one row", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-devinfo-"));
    dirs.push(root);
    await fs.mkdir(path.join(root, "workflows", "sdxl"), { recursive: true });
    await fs.mkdir(path.join(root, "trash", "a"), { recursive: true });
    await fs.writeFile(path.join(root, "settings.json"), "{}");
    await fs.writeFile(path.join(root, "workflows", "sdxl", "workflow.json"), "{ }");
    await fs.writeFile(path.join(root, "trash", "a", "x.png"), "12345");
    await fs.writeFile(path.join(root, "trash", "y.png"), "123");
    const { files, truncated } = await listFiles(root);
    expect(truncated).toBe(false);
    expect(files).toEqual([
      { path: "trash", size: 8, dir: true, files: 2 },
      { path: "workflows", size: 0, dir: true, files: null },
      { path: "workflows/sdxl", size: 0, dir: true, files: null },
      { path: "workflows/sdxl/workflow.json", size: 3, dir: false, files: null },
      { path: "settings.json", size: 2, dir: false, files: null },
    ]);
  });

  it("describes tables with columns and rows, without FTS5's own tables", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE images (id INTEGER PRIMARY KEY, path TEXT NOT NULL, size INTEGER DEFAULT 0);
      CREATE INDEX images_path ON images (path);
      CREATE VIRTUAL TABLE images_fts USING fts5(text);
      INSERT INTO images (path) VALUES ('a.png'), ('b.png');
    `);
    const tables = describeTables(db);
    expect(tables.map((t) => [t.name, t.kind, t.rows])).toEqual([
      ["images", "table", 2],
      ["images_fts", "virtual", 0],
    ]);
    expect(tables[0]?.columns.map((c) => [c.name, c.pk, c.notNull, c.default])).toEqual([
      ["id", 1, false, null],
      ["path", 0, true, null],
      ["size", 0, false, "0"],
    ]);
    expect(tables[0]?.indexes).toEqual(["images_path"]);
    db.close();
  });

  it("parses JSON chunks and leaves text as it is", () => {
    expect(toChunk("blombo", '{"seed":1}').json).toEqual({ seed: 1 });
    expect(toChunk("parameters", "a cat\nSteps: 5").json).toBeNull();
    expect(toChunk("prompt", "{broken").json).toBeNull();
  });
});
