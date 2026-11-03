import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listWildcards, loadWildcards, WildcardFiles, WildcardFolders } from "./wildcards.ts";

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
    expect(await listWildcards([root])).toEqual([
      "colors",
      "outfits/fantasy",
      "outfits/modern",
      "places/forest",
    ]);
  });

  it("resolves nested references from txt and YAML", async () => {
    const resolve = await loadWildcards([root], ["__outfits/fantasy__ in __places/forest__"]);
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

describe("several wildcard folders", () => {
  const second = path.join(tmp, "second");
  const folders = new WildcardFolders(
    [
      { id: "main", name: "Main", path: root },
      { id: "more", name: "More", path: second },
    ],
    trash,
  );

  beforeAll(async () => {
    await fs.mkdir(path.join(second, "places"), { recursive: true });
    await fs.writeFile(path.join(second, "colors.txt"), "teal");
    await fs.writeFile(path.join(second, "animals.txt"), "fox\nowl");
  });

  it("looks names up in order: the higher folder wins", async () => {
    const resolve = await loadWildcards([root, second], ["__colors__ __animals__"]);
    expect(resolve("colors")).not.toContain("teal");
    expect(resolve("animals")).toEqual(["fox", "owl"]);
    expect(await listWildcards([root, second])).toContain("animals");
  });

  it("shows every folder as a top-level folder and marks the hidden names", async () => {
    const tree = await folders.tree();
    expect(tree.folders.map((f) => `${f.id}:${f.exists}`)).toEqual(["main:true", "more:true"]);
    const paths = tree.entries.map((e) => e.path);
    expect(paths).toContain("main");
    expect(paths).toContain("more/animals.txt");
    expect(paths).toContain("main/colors.txt");
    expect(tree.hidden).toEqual(["more/colors.txt"]);
  });

  it("reads and writes by folder id, and keeps moves inside one folder", async () => {
    expect((await folders.read("more/animals.txt")).text).toBe("fox\nowl");
    const saved = await folders.save("more/animals.txt", "fox\nowl\nhare", null);
    expect(saved.path).toBe("more/animals.txt");
    await expect(folders.move("more/animals.txt", "main/animals.txt")).rejects.toThrow(
      /within one wildcard folder/,
    );
    await expect(folders.read("gone/animals.txt")).rejects.toThrow(/isn't in this profile/);
    await expect(folders.create("more", "folder")).rejects.toThrow(/inside a wildcard folder/);
  });

  it("renames a picker's wildcard and folder, and updates full references", async () => {
    await fs.mkdir(path.join(second, "zoo"), { recursive: true });
    await fs.writeFile(path.join(second, "zoo", "cats.txt"), "tabby");
    await fs.writeFile(path.join(second, "refs.txt"), "__zoo/cats__ __zoo/catsup__ <lora:x:1>");
    const change = await folders.rename("zoo/cats", "felines", false);
    expect(change).toEqual({
      kind: "wildcard",
      from: "zoo/cats",
      to: "zoo/felines",
      folder: false,
    });
    expect(await fs.readFile(path.join(second, "zoo", "felines.txt"), "utf8")).toBe("tabby");
    expect(await folders.renameRefs([change])).toEqual({ files: 1 });
    expect(await fs.readFile(path.join(second, "refs.txt"), "utf8")).toBe(
      "__zoo/felines__ __zoo/catsup__ <lora:x:1>",
    );
    const dir = await folders.rename("zoo", "park", true);
    expect(dir.to).toBe("park");
    expect(await fs.readFile(path.join(second, "park", "felines.txt"), "utf8")).toBe("tabby");
    await expect(folders.rename("outfits/fantasy", "x", false)).rejects.toThrow(/\.yaml/);
  });
});
