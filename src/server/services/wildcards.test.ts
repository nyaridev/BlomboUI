import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { wildcardLines } from "../../shared/prompt/wildcards.ts";
import {
  listWildcards,
  loadWildcards,
  renameYamlKey,
  WildcardFiles,
  WildcardFolders,
} from "./wildcards.ts";

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

  it("tells where a wildcard comes from, how many entries it has and the first few", async () => {
    const txt = await folders.info("colors");
    // An earlier test rewrites colors.txt: compare with what's on disk.
    const lines = wildcardLines(await fs.readFile(path.join(root, "colors.txt"), "utf8"));
    expect(txt).toMatchObject({ path: "main/colors.txt", format: "txt", folder: "Main" });
    expect(txt.count).toBe(lines.length);
    expect(txt.sample).toEqual(lines.slice(0, 8));
    const yaml = await folders.info("outfits/fantasy");
    expect(yaml).toMatchObject({ path: "main/packs/outfits.yaml", format: "yaml", count: 2 });
    expect((await folders.info("animals")).folder).toBe("More");
    await expect(folders.info("nope")).rejects.toThrow(/No wildcard named/);
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
    await expect(folders.rename("nothing/here", "x", false)).rejects.toThrow(/No wildcard/);
  });
});

describe("renaming YAML wildcards and groups", () => {
  const YAML =
    "# pack\nouts: # all of them\n  fantasy: [cloak, robe] # flow kept\n  modern:\n    - hoodie\n";

  it("changes only the key's characters", () => {
    expect(renameYamlKey(YAML, ["outs", "fantasy"], "medieval", false)).toBe(
      YAML.replace("fantasy:", "medieval:"),
    );
    expect(renameYamlKey(YAML, ["outs"], "outfits", true)).toBe(YAML.replace("outs:", "outfits:"));
    expect(renameYamlKey(YAML, ["outs", "modern"], "a: b", false)).toContain('"a: b":');
    expect(renameYamlKey("﻿a: [x]\n", ["a"], "b", false)).toBe("﻿b: [x]\n");
  });

  it("refuses a taken name, the wrong kind, a missing key and broken YAML", () => {
    expect(renameYamlKey(YAML, ["outs", "fantasy"], "modern", false)).toBe("exists");
    expect(renameYamlKey(YAML, ["outs"], "x", false)).toBeNull();
    expect(renameYamlKey(YAML, ["outs", "fantasy"], "x", true)).toBeNull();
    expect(renameYamlKey(YAML, ["outs", "space"], "x", false)).toBeNull();
    expect(renameYamlKey("a: [b", ["a"], "x", false)).toBeNull();
  });

  it("renames where the name is defined, and a group in every file and folder", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-yaml-rename-"));
    const one = path.join(base, "one");
    const two = path.join(base, "two");
    await fs.mkdir(path.join(two, "outs"), { recursive: true });
    await fs.mkdir(one, { recursive: true });
    await fs.writeFile(path.join(one, "a.yaml"), YAML);
    // Shadowed by one/a.yaml for the wildcard; still a group named outs.
    await fs.writeFile(path.join(two, "b.yaml"), "outs:\n  fantasy: [elf]\n");
    await fs.writeFile(path.join(two, "outs", "retro.txt"), "disco");
    const folders = new WildcardFolders(
      [
        { id: "one", name: "One", path: one },
        { id: "two", name: "Two", path: two },
      ],
      path.join(base, "trash"),
    );
    const read = (dir: string, file: string) => fs.readFile(path.join(dir, file), "utf8");
    try {
      expect(await folders.rename("outs/fantasy", "medieval", false)).toEqual({
        kind: "wildcard",
        from: "outs/fantasy",
        to: "outs/medieval",
        folder: false,
      });
      expect(await read(one, "a.yaml")).toBe(YAML.replace("fantasy:", "medieval:"));
      expect(await read(two, "b.yaml")).toBe("outs:\n  fantasy: [elf]\n");

      await expect(folders.rename("outs/medieval", "modern", false)).rejects.toThrow(
        /already exists in a\.yaml/,
      );

      await folders.rename("outs", "outfits", true);
      expect(await read(one, "a.yaml")).toBe(
        YAML.replace("fantasy:", "medieval:").replace("outs:", "outfits:"),
      );
      expect(await read(two, "b.yaml")).toBe("outfits:\n  fantasy: [elf]\n");
      expect(await read(two, "outfits/retro.txt")).toBe("disco");
      expect((await listWildcards([one, two])).sort()).toEqual([
        "outfits/fantasy",
        "outfits/medieval",
        "outfits/modern",
        "outfits/retro",
      ]);
      await expect(folders.rename("space", "x", true)).rejects.toThrow(/No folder or YAML group/);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});
