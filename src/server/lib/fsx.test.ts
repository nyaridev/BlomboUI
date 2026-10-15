import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  commitPart,
  freePath,
  movePath,
  openPartFile,
  removePart,
  resolveInside,
  writeFileIfAbsent,
  writeJsonAtomic,
} from "./fsx.ts";

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

describe("downloads", () => {
  it("resumes a part file and commits it without replacing a file", async () => {
    const target = path.join(dir, "dl", "model.safetensors");
    const first = await openPartFile(target, true);
    expect(first.offset).toBe(0);
    await first.write(new TextEncoder().encode("abc"));
    await first.close();
    const again = await openPartFile(target, true);
    expect(again.offset).toBe(3);
    await again.write(new TextEncoder().encode("def"));
    await again.close();
    await fs.writeFile(target, "someone else's file");
    const final = await commitPart(again.path, target);
    expect(final).toBe(path.join(dir, "dl", "model (2).safetensors"));
    expect(await fs.readFile(final, "utf8")).toBe("abcdef");
    expect(await fs.readFile(target, "utf8")).toBe("someone else's file");
  });

  it("starts over when not resuming and removes only part files", async () => {
    const target = path.join(dir, "dl", "fresh.bin");
    await fs.writeFile(`${target}.part`, "old");
    const part = await openPartFile(target, false);
    expect(part.offset).toBe(0);
    await part.close();
    expect(await fs.readFile(part.path, "utf8")).toBe("");
    await fs.writeFile(target, "keep");
    await removePart(target);
    await removePart(part.path);
    expect(await fs.readFile(target, "utf8")).toBe("keep");
    await expect(fs.stat(part.path)).rejects.toThrow();
  });

  it("writes sidecars only when absent", async () => {
    const file = path.join(dir, "dl", "model.civitai.info");
    expect(await writeFileIfAbsent(file, "{}")).toBe(true);
    expect(await writeFileIfAbsent(file, "changed")).toBe(false);
    expect(await fs.readFile(file, "utf8")).toBe("{}");
  });
});
