import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listWildcards, loadWildcards, WildcardFiles } from "./wildcards.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-wildcards-"));
const root = path.join(tmp, "wildcards");
const trash = path.join(tmp, "trash");
const files = new WildcardFiles(root, trash);

async function put(rel: string, text: string) {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

beforeAll(async () => {
  await put("colors.txt", "red\n# comment\nblue\n\n");
  await put("places/forest.txt", "misty forest\n__colors__ grove");
  await put(
    "packs/outfits.yaml",
    "outfits:\n  fantasy:\n    - cloak\n    - __colors__ armor\n  modern: hoodie\n",
  );
  await put("broken.yaml", "a: [unclosed");
  await put("readme.md", "not a wildcard");
});

afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("wildcard files", () => {
  it("lists txt names and YAML keys", async () => {
    expect(await listWildcards(root)).toEqual([
      "colors",
      "outfits/fantasy",
      "outfits/modern",
      "places/forest",
    ]);
  });

  it("resolves nested references from txt and YAML", async () => {
    const resolve = await loadWildcards(root, ["__outfits/fantasy__ in __places/forest__"]);
    expect(resolve("outfits/fantasy")).toEqual(["cloak", "__colors__ armor"]);
    expect(resolve("colors")).toEqual(["red", "blue"]);
    expect(resolve("nope")).toBeUndefined();
  });

  it("builds a tree with folders and formats", async () => {
    const tree = await files.tree();
    expect(tree.exists).toBe(true);
    expect(tree.entries.map((e) => `${e.type}:${e.path}`)).toEqual([
      "file:broken.yaml",
      "file:colors.txt",
      "folder:packs",
      "file:packs/outfits.yaml",
      "folder:places",
      "file:places/forest.txt",
    ]);
  });

  it("rolls with the same seed the same way, using unsaved overrides", async () => {
    const a = await files.roll("__colors__ cat", 3, 10, {});
    const b = await files.roll("__colors__ cat", 3, 10, {});
    expect(a).toEqual(b);
    expect(a.rolls.map((r) => r.seed)).toEqual([10, 11, 12]);
    for (const r of a.rolls) expect(["red cat", "blue cat"]).toContain(r.text);
    const o = await files.roll("__colors__", 2, 1, { colors: ["green"] });
    expect(o.rolls.map((r) => r.text)).toEqual(["green", "green"]);
    expect((await files.roll("__missing__", 1, 1, {})).rolls[0]?.missing).toEqual(["missing"]);
  });

  it("saves atomically and refuses to overwrite a newer file", async () => {
    const file = await files.read("colors.txt");
    const saved = await files.save("colors.txt", "red\nblue\ngreen\n", file.mtime);
    expect(await fs.readFile(path.join(root, "colors.txt"), "utf8")).toBe("red\nblue\ngreen\n");
    await expect(files.save("colors.txt", "x", saved.mtime - 5000)).rejects.toThrow(
      /changed on disk/,
    );
    await expect(files.save("colors.md", "x", null)).rejects.toThrow(/\.txt, \.yaml/);
  });

  it("creates, moves and trashes without deleting", async () => {
    await files.create("new/one.txt", "file");
    await expect(files.create("new/one.txt", "file")).rejects.toThrow(/already exists/);
    await files.move("new/one.txt", "new/two.txt");
    await expect(files.move("new", "new/inside")).rejects.toThrow(/into itself/);
    await files.remove("new");
    await expect(fs.access(path.join(root, "new"))).rejects.toThrow();
    const trashed = await fs.readdir(trash, { recursive: true });
    expect(trashed.some((f) => String(f).replace(/\\/g, "/").endsWith("new/two.txt"))).toBe(true);
  });
});
