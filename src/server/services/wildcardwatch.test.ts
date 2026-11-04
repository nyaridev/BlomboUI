import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { countsAsWildcardChange, WildcardWatcher } from "./wildcardwatch.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-wildcard-watch-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("wildcard watcher", () => {
  it("counts wildcard files and folders, not temp files or dotfiles", () => {
    expect(countsAsWildcardChange("outfits/fantasy.txt")).toBe(true);
    expect(countsAsWildcardChange("packs\\all.yml")).toBe(true);
    expect(countsAsWildcardChange("people")).toBe(true);
    expect(countsAsWildcardChange("a.yaml.123.456.abc.tmp")).toBe(false);
    expect(countsAsWildcardChange(".git")).toBe(false);
    expect(countsAsWildcardChange("notes.md")).toBe(false);
    expect(countsAsWildcardChange(null)).toBe(true);
  });

  it("calls back once a burst of changes settles, and stops when closed", async () => {
    let calls = 0;
    const watcher = new WildcardWatcher(() => calls++);
    watcher.watch([tmp, path.join(tmp, "missing")]);
    await new Promise((r) => setTimeout(r, 100));
    await fs.writeFile(path.join(tmp, "a.txt"), "x");
    await fs.writeFile(path.join(tmp, "b.yaml"), "k: [v]");
    for (let i = 0; i < 40 && calls === 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
    watcher.close();
    await fs.writeFile(path.join(tmp, "c.txt"), "y");
    await new Promise((r) => setTimeout(r, 500));
    expect(calls).toBe(1);
  });
});
