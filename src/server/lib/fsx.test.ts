import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveInside, writeJsonAtomic } from "./fsx.ts";

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

describe("resolveInside", () => {
  it("allows nested paths and refuses escapes", () => {
    expect(resolveInside(dir, "a/b.json")).toBe(path.join(dir, "a", "b.json"));
    expect(() => resolveInside(dir, "../outside.json")).toThrow();
  });
});
