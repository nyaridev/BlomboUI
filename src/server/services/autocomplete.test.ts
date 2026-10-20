import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { ProfileDbs } from "../db/profileDb.ts";
import { AutocompleteService } from "./autocomplete.ts";
import { ModelService } from "./models.ts";
import { ProfileService } from "./profiles.ts";
import { SettingsService } from "./settings.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-autocomplete-"));
const models = path.join(tmp, "models");
const wildcards = path.join(tmp, "wildcards");
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const profiles = new ProfileService(config);
const settings = new SettingsService((id) => profiles.dir(id));
const dbs = new ProfileDbs((id) => path.join(profiles.dir(id), "blombo.sqlite"));
const service = new AutocompleteService({
  presetsDir: config.presetsDir,
  profiles,
  settings,
  dbs,
  models: new ModelService({ profiles, runtimeDir: config.runtimeDir, onChanged: () => undefined }),
});

beforeAll(async () => {
  await fs.mkdir(path.join(models, "loras", "style"), { recursive: true });
  await fs.writeFile(path.join(models, "loras", "style", "Detailer.safetensors"), "x");
  await fs.writeFile(
    path.join(models, "loras", "style", "Detailer.civitai.info"),
    JSON.stringify({
      id: 2,
      modelId: 1,
      baseModel: "Illustrious",
      trainedWords: ["sharp details"],
      model: { name: "Detail Slider", nsfw: false },
    }),
  );
  await fs.mkdir(path.join(wildcards, "outfits"), { recursive: true });
  await fs.writeFile(path.join(wildcards, "outfits", "fantasy.txt"), "robe\narmor\n");
  const p = await profiles.create({
    name: "Tags",
    accent: "blue",
    theme: "blombo",
    paths: { models, outputs: "", wildcards },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(p.id);
});

afterAll(async () => {
  dbs.closeAll();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("autocomplete", () => {
  it("suggests tags from the bundled list by prefix and alias", async () => {
    const hair = await service.suggest("long_ha", "tag", 5);
    expect(hair[0]).toMatchObject({ kind: "tag", text: "long_hair", category: 0 });
    const alias = await service.suggest("wink", "tag", 5);
    expect(alias[0]).toMatchObject({ text: "one_eye_closed", detail: "wink →" });
    // Spaces match underscores.
    expect((await service.suggest("blue sk", "tag", 5))[0]?.text).toBe("blue_sky");
  });

  it("adds, uses and removes a profile list", async () => {
    const csv = 'zebra_stripes,0,500,\nzebra,0,9000,"horse_stripes"\n';
    const info = await service.addList("animals.csv", new TextEncoder().encode(csv));
    expect(info).toMatchObject({ id: "profile:animals.csv", tags: 2, source: "profile" });
    const out = await service.suggest("zeb", "tag", 5);
    expect(out.map((s) => [s.text, s.detail])).toEqual([
      ["zebra", "9.0k"],
      ["zebra_stripes", "500"],
    ]);
    await expect(service.addList("animals.csv", new TextEncoder().encode(csv))).rejects.toThrow(
      /already a list/,
    );
    const lists = await service.lists();
    expect(lists.lists.map((l) => l.id)).toEqual(["bundled:starter.csv", "profile:animals.csv"]);
    await settings.update(profiles.active as string, {
      autocomplete: { disabledLists: ["profile:animals.csv"] },
    });
    expect(await service.suggest("zeb", "tag", 5)).toEqual([]);
    await service.removeList("animals.csv");
    expect((await service.lists()).lists).toHaveLength(1);
  });

  it("puts frequent tags first once they've been used twice", async () => {
    service.record(["masterpiece, (glowing runes:1.2), <lora:x:1>"]);
    expect(await service.suggest("glowing r", "tag", 5)).toEqual([]);
    service.record(["glowing runes, smile"]);
    const out = await service.suggest("glow", "tag", 5);
    expect(out[0]).toMatchObject({ text: "glowing_runes", uses: 2, detail: "used 2×" });
    expect(out.map((s) => s.text)).toEqual(expect.arrayContaining(["glowing", "glowing_eyes"]));
    // An exact tag comes before longer ones.
    expect((await service.suggest("glowing", "tag", 5))[1]?.text).toBe("glowing");
    service.clearFrequent();
    expect((await service.lists()).frequent).toEqual([]);
  });

  it("suggests LoRAs, their trigger words and wildcards", async () => {
    const loras = await service.suggest("deta", "lora", 5);
    expect(loras[0]).toMatchObject({
      kind: "lora",
      text: "<lora:Detailer:1>",
      label: "Detail Slider",
      triggers: ["sharp details"],
    });
    const triggers = await service.suggest("sharp d", "tag", 5);
    expect(triggers.find((s) => s.kind === "trigger")).toMatchObject({
      text: "sharp details",
      detail: "trigger · Detail Slider",
    });
    expect(await service.suggest("fant", "wildcard", 5)).toMatchObject([
      { kind: "wildcard", text: "__outfits/fantasy__" },
    ]);
  });

  it("stays quiet when turned off", async () => {
    await settings.update(profiles.active as string, { autocomplete: { enabled: false } });
    expect(await service.suggest("long", "tag", 5)).toEqual([]);
    await settings.update(profiles.active as string, { autocomplete: { enabled: true } });
  });
});
