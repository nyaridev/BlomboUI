import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openProfileDb } from "../db/profileDb.ts";
import { readProfileStats } from "./profileStats.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-stats-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("readProfileStats", () => {
  it("counts zeros for a profile that was never opened, without making its database", async () => {
    const dir = path.join(tmp, "fresh");
    await fs.mkdir(dir, { recursive: true });
    expect(await readProfileStats(dir)).toEqual({ images: 0, favorites: 0, runs: 0 });
    await expect(fs.stat(path.join(dir, "blombo.sqlite"))).rejects.toThrow();
  });

  it("reads images, favorites and runs while the profile's own connection is open", async () => {
    const dir = path.join(tmp, "used");
    const pdb = openProfileDb(path.join(dir, "blombo.sqlite"));
    const image = pdb.db.prepare(
      `INSERT INTO images (library, path, name, folder, size, mtime, width, height, source,
         summary, settings, search, indexed_at) VALUES ('out', ?, ?, '', 1, 1, 8, 8, 'png', '', '{}', '', 1)`,
    );
    for (const n of ["a.png", "b.png", "c.png"]) image.run(n, n);
    pdb.db.exec(
      "INSERT INTO marks (library, path, favorite) VALUES ('out', 'a.png', 1), ('out', 'b.png', 0)",
    );
    const run = pdb.db.prepare(
      `INSERT INTO job_log (id, workflow_id, workflow_name, kind, state, images, created_at,
         finished_at, duration_ms, values_json, timings) VALUES (?, 'w', 'W', 'run', 'done', 1, 0, ?, ?, '{}', '[]')`,
    );
    run.run("j1", 1000, 1500);
    run.run("j2", 5000, null);
    try {
      expect(await readProfileStats(dir)).toEqual({ images: 3, favorites: 1, runs: 2 });
    } finally {
      pdb.close();
    }
  });
});
