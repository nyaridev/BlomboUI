/** Scopes in the profile's scopes.json: off by default, created with an id, deleted with their pictures. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { ProfileService } from "./profiles.ts";
import { ScopeService } from "./scopes.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-scopes-"));
const profiles = new ProfileService(createConfig(parseFlags(["--data", path.join(tmp, "data")])));
const removed: string[] = [];
const scopes = new ScopeService({
  profiles,
  removePictures: async (id) => {
    removed.push(id);
    return 3;
  },
});
const file = () => path.join(profiles.dir(profiles.active as string), "scopes.json");

beforeAll(async () => {
  const p = await profiles.create({
    name: "Scopes",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(p.id);
});
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("scopes", () => {
  it("starts off, with no scopes, without writing anything", async () => {
    expect(await scopes.get()).toMatchObject({ enabled: false, scopes: [] });
    await expect(fs.stat(file())).rejects.toThrow();
  });

  it("creates scopes with their own ids and refuses a name that's taken", async () => {
    const [skirt, highs] = await Promise.all([
      scopes.create({ name: "Skirt", group: "", tags: ["skirt"] }),
      scopes.create({ name: "Thighhighs", group: "", tags: [] }),
    ]);
    expect(skirt.id).toMatch(/^[a-f0-9]{12}$/);
    expect(skirt.id).not.toBe(highs.id);
    await expect(scopes.create({ name: "skirt", group: "", tags: [] })).rejects.toThrow(/already/);
    const renamed = await scopes.save(skirt.id, { name: "Skirts", group: "", tags: ["skirt"] });
    expect(renamed.id).toBe(skirt.id);
    await scopes.patch({
      enabled: true,
      view: { ids: [skirt.id, highs.id], optional: [], auto: false },
    });
    expect((await scopes.get()).scopes.map((s) => s.name)).toEqual(["Skirts", "Thighhighs"]);

    expect(await scopes.remove(skirt.id)).toEqual({ pictures: 3 });
    expect(removed).toEqual([skirt.id]);
    const after = await scopes.get();
    expect(after.scopes.map((s) => s.id)).toEqual([highs.id]);
    expect(after.view.ids).toEqual([highs.id]);
    expect(after.enabled).toBe(true);
  });

  it("keeps the valid scopes of a hand-edited file", async () => {
    const saved = JSON.parse(await fs.readFile(file(), "utf8"));
    saved.scopes.push({ id: "nope", name: "Broken" });
    await fs.writeFile(file(), JSON.stringify(saved));
    expect((await scopes.get()).scopes.map((s) => s.name)).toEqual(["Thighhighs"]);
  });
});
