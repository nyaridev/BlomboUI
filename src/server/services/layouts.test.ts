import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { LayoutService } from "./layouts.ts";
import { ProfileService } from "./profiles.ts";
import { SettingsService } from "./settings.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-layouts-"));
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const profiles = new ProfileService(config);
const settings = new SettingsService((id) => profiles.dir(id));
const layouts = new LayoutService({ presetsDir: config.presetsDir, profiles, settings });
let profileId = "";

beforeAll(async () => {
  const p = await profiles.create({
    name: "Layouts",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  profileId = p.id;
  await profiles.open(p.id);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("layouts", () => {
  it("lists the built-in layouts with the default first", async () => {
    const list = await layouts.list();
    expect(list.builtins.map((l) => l.id)).toEqual(["default", "compact"]);
    expect(list.custom).toEqual([]);
    expect(list.defaultId).toBe("default");
  });

  it("saves layouts into the profile and resolves links with a fallback", async () => {
    const base = (await layouts.find("compact")) ?? (await layouts.builtins())[0];
    if (!base) throw new Error("no built-in layout");
    const mine = await layouts.create({ name: "Portrait work", doc: base });
    expect(mine.id).toBe("portrait-work");
    expect(mine.name).toBe("Portrait work");
    const file = path.join(profiles.dir(profileId), "layouts", "portrait-work.json");
    expect(JSON.parse(await fs.readFile(file, "utf8")).sizes).toEqual(base.sizes);
    expect((await layouts.create({ name: "Portrait work", doc: base })).id).toBe("portrait-work-2");
    // A name that's a built-in id gets a free one.
    expect((await layouts.create({ name: "Default", doc: base })).id).toBe("default-2");

    expect(await layouts.resolve("portrait-work")).toMatchObject({
      source: "linked",
      doc: { id: "portrait-work" },
    });
    expect(await layouts.resolve(null)).toMatchObject({
      source: "default",
      doc: { id: "default" },
    });

    // The profile default follows settings.
    await settings.update(profileId, { generate: { layout: "portrait-work" } });
    expect((await layouts.resolve(null)).doc.id).toBe("portrait-work");

    const saved = await layouts.save("portrait-work", { ...mine, sizes: { params: 500 } });
    expect(saved.sizes.params).toBe(500);
    await expect(layouts.save("default", mine)).rejects.toThrow(/Built-in layouts/);

    await layouts.remove("portrait-work");
    expect((await layouts.list()).custom.map((l) => l.id)).toEqual([
      "default-2",
      "portrait-work-2",
    ]);
    // A linked layout that's gone falls back; so does a default that's gone.
    expect(await layouts.resolve("portrait-work")).toMatchObject({
      source: "default",
      doc: { id: "default" },
    });
    const trash = await fs.readdir(path.join(profiles.dir(profileId), "trash", "layouts"));
    expect(trash).toHaveLength(1);
  });

  it("refuses odd ids", async () => {
    await expect(layouts.remove("../x")).rejects.toThrow(/Invalid layout id/);
  });
});
