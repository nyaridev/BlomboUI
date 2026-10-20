import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { ProfileDbs } from "../db/profileDb.ts";
import { ProfileBackup, safeEntry } from "./backup.ts";
import { ProfileService } from "./profiles.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-backup-"));
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const profiles = new ProfileService(config);
const dbs = new ProfileDbs((id) => path.join(profiles.dir(id), "blombo.sqlite"));
const backup = new ProfileBackup({ profiles, dbs, runtimeDir: config.runtimeDir });
let id = "";

beforeAll(async () => {
  const p = await profiles.create({
    name: "Studio",
    accent: "pink",
    theme: "blombo",
    paths: { models: "C:/models", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  id = p.id;
  await profiles.open(id);
  const dir = profiles.dir(id);
  await fs.writeFile(path.join(dir, "settings.json"), JSON.stringify({ version: 1 }));
  await fs.writeFile(path.join(dir, "secrets.json"), JSON.stringify({ civitai: { key: "k" } }));
  await fs.mkdir(path.join(dir, "trash", "x"), { recursive: true });
  await fs.writeFile(path.join(dir, "trash", "x", "old.txt"), "old");
  await fs.mkdir(path.join(dir, "workflows", "sd15"), { recursive: true });
  await fs.writeFile(path.join(dir, "workflows", "sd15", "workflow.json"), "{}");
  dbs.get(id).db.exec("INSERT INTO tag_usage (tag, uses, last_used) VALUES ('cat', 3, 1)");
});

afterAll(async () => {
  dbs.closeAll();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("profile backup", () => {
  it("exports the profile without the trash or the secret key", async () => {
    const { file, name } = await backup.export(id);
    expect(name).toMatch(/^studio-\d{4}-\d{2}-\d{2}\.blombo-profile\.zip$/);
    expect(file.startsWith(config.runtimeDir)).toBe(true);
    const entries = Object.keys(unzipSync(new Uint8Array(await fs.readFile(file)))).sort();
    expect(entries).toEqual(
      [
        "blombo-profile.json",
        "blombo.sqlite",
        "profile.json",
        "settings.json",
        "workflows/sd15/workflow.json",
      ].sort(),
    );
  });

  it("imports an export as a new profile with its database", async () => {
    const { file } = await backup.export(id);
    const imported = await backup.import(new Uint8Array(await fs.readFile(file)));
    expect(imported).toMatchObject({ id: "studio-2", name: "Studio (imported)", accent: "pink" });
    expect((await profiles.registry()).order).toEqual([id, "studio-2"]);
    const dir = profiles.dir("studio-2");
    await fs.access(path.join(dir, "workflows", "sd15", "workflow.json"));
    await expect(fs.access(path.join(dir, "secrets.json"))).rejects.toThrow();
    const row = dbs
      .get("studio-2")
      .db.prepare("SELECT uses FROM tag_usage WHERE tag = 'cat'")
      .get() as {
      uses: number;
    };
    expect(row.uses).toBe(3);
  });

  it("refuses zips that aren't exports, and paths that leave the folder", async () => {
    await expect(backup.import(strToU8("nope"))).rejects.toThrow("isn't a profile export");
    await expect(backup.import(zipSync({ "a.txt": strToU8("x") }))).rejects.toThrow(
      "no blombo-profile.json",
    );
    expect(safeEntry("../evil.txt")).toBeNull();
    expect(safeEntry("C:/Windows/x")).toBeNull();
    expect(safeEntry("/etc/passwd")).toBeNull();
    expect(safeEntry("workflows\\a\\b.json")).toBe("workflows/a/b.json");
  });
});
