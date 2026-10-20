import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { MIGRATIONS, openProfileDb } from "./profileDb.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-db-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const version = (db: DatabaseSync) =>
  (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

describe("profile database migrations", () => {
  it("brings a version-1 database up to date and keeps the user's marks and trash", async () => {
    const file = path.join(tmp, "old", "blombo.sqlite");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const v1 = new DatabaseSync(file);
    v1.exec(MIGRATIONS[0] as string);
    v1.exec(`
      INSERT INTO marks (library, path, favorite) VALUES ('outputs', 'a.png', 1);
      INSERT INTO trash (id, library, path, file, size, width, height, mtime, favorite, trashed_at)
        VALUES ('t1', 'outputs', 'b.png', 't1/b.png', 10, 1, 1, 0, 1, 0);
      PRAGMA user_version = 1;
    `);
    v1.close();

    const pdb = openProfileDb(file);
    expect(version(pdb.db)).toBe(MIGRATIONS.length);
    expect(pdb.db.prepare("SELECT favorite, rating FROM marks").get()).toMatchObject({
      favorite: 1,
      rating: 0,
    });
    expect(pdb.db.prepare("SELECT id, file FROM trash").get()).toMatchObject({
      id: "t1",
      file: "t1/b.png",
    });
    pdb.close();
  });

  it("refuses a database from a newer version instead of changing it", async () => {
    const file = path.join(tmp, "newer", "blombo.sqlite");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    db.close();
    expect(() => openProfileDb(file)).toThrow(/newer BlomboUI/);
    const again = new DatabaseSync(file);
    expect(version(again)).toBe(MIGRATIONS.length + 1);
    again.close();
  });
});
