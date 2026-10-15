import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { freePath, movePath, resolveInside, writeJsonAtomic } from "./fsx.ts";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-fsx-"));
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe("writeJsonAtomic", () => {
  it("survives many concurrent writes to one file and keeps the last one", async () => {
    const file = path.join(dir, "profile.json");
    await Promise.all(Array.from({ length: 25 }, (_, i) => writeJsonAtomic(file, { n: i })));
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual({ n: 24 });
    const leftovers = (await fs.readdir(dir)).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});

describe("movePath", () => {
  it("moves into new folders and refuses to overwrite", async () => {
    const a = path.join(dir, "move", "a.txt");
    const b = path.join(dir, "move", "deep", "b.txt");
    await fs.mkdir(path.dirname(a), { recursive: true });
    await fs.writeFile(a, "A");
    await fs.writeFile(path.join(dir, "move", "c.txt"), "C");
    await movePath(a, b);
    expect(await fs.readFile(b, "utf8")).toBe("A");
    await expect(movePath(b, path.join(dir, "move", "c.txt"))).rejects.toThrow(/already exists/);
    expect(await fs.readFile(path.join(dir, "move", "c.txt"), "utf8")).toBe("C");
  });

  it("allows a case-only rename", async () => {
    const a = path.join(dir, "case.txt");
    await fs.writeFile(a, "x");
    await movePath(a, path.join(dir, "CASE.txt"));
    expect(await fs.readdir(dir)).toContain("CASE.txt");
  });

  it("finds a free name", async () => {
    const t = path.join(dir, "free.png");
    await fs.writeFile(t, "");
    expect(await freePath(t)).toBe(path.join(dir, "free (2).png"));
  });
});

describe("resolveInside", () => {
  it("allows nested paths and refuses escapes", () => {
    expect(resolveInside(dir, "a/b.json")).toBe(path.join(dir, "a", "b.json"));
    expect(() => resolveInside(dir, "../outside.json")).toThrow();
  });
});
