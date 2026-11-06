/**
 * Leftovers: a model's info and pictures beside a model that's gone, a wildcard picture whose
 * wildcard is gone, a favorite on nothing; clearing moves files to the trash and forgets the
 * favorites; a folder that isn't there is skipped, never judged. Also: wildcard pictures follow
 * renames.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalModel } from "../../shared/models.ts";
import { createConfig, parseFlags } from "../config.ts";
import { LeftoverService } from "./leftovers.ts";
import { ProfileService } from "./profiles.ts";
import { WildcardPictures } from "./wildcardpics.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-leftovers-"));
const config = createConfig(parseFlags(["--data", path.join(tmp, "data")]));
const profiles = new ProfileService(config);
const models = path.join(tmp, "models");
const wildcards = path.join(tmp, "wildcards");
const pictures = new WildcardPictures(profiles);
let marks = [
  { kind: "loras", name: "style\\kept.safetensors" },
  { kind: "loras", name: "style\\gone.safetensors" },
  { kind: "wildcards", name: "colors" },
  { kind: "wildcards", name: "gone" },
];
const leftovers = new LeftoverService({
  profiles,
  models: {
    list: async () =>
      ({
        models: [{ kind: "loras", folder: "style", file: "kept.safetensors" } as LocalModel],
      }) as never,
  },
  history: {
    allMarks: () => marks,
    removeMarks: (list) => {
      marks = marks.filter((m) => !list.some((x) => x.kind === m.kind && x.name === m.name));
    },
  },
  pictures,
});

async function put(file: string, text = "x") {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}
const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#808080" } })
    .png()
    .toBuffer();

beforeAll(async () => {
  const p = await profiles.create({
    name: "Leftovers",
    accent: "blue",
    theme: "blombo",
    paths: { models, outputs: "", wildcards },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(p.id);
  const lora = path.join(models, "loras", "style");
  await put(path.join(lora, "kept.safetensors"));
  await put(path.join(lora, "kept.civitai.info"), "{}");
  await put(path.join(lora, "gone.civitai.info"), "{}");
  await put(path.join(lora, "gone.json"), JSON.stringify({ "activation text": "x" }));
  await put(path.join(lora, "config.json"), JSON.stringify({ hidden_size: 1 }));
  await put(path.join(lora, "gone_data", "thumbs", "global.jpg"));
  await put(path.join(wildcards, "colors.txt"), "red\nblue");
  await pictures.set("colors", await png());
  await pictures.set("gone", await png());
});

afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("leftovers", () => {
  it("finds what's kept for models and wildcards that are gone", async () => {
    const report = await leftovers.scan();
    const ids = report.items.map((i) => `${i.kind}:${i.name}`).sort();
    expect(ids).toEqual([
      "favorite:gone",
      "favorite:style/gone.safetensors",
      "model:gone",
      "wildcard-picture:gone",
    ]);
    const model = report.items.find((i) => i.kind === "model");
    expect(model?.detail).toContain("Civitai info");
    expect(model?.detail).toContain("pictures");
    expect(report.skipped).toEqual([]);
  });

  it("moves files to the trash and forgets favorites", async () => {
    const report = await leftovers.scan();
    const done = await leftovers.clear(report.items.map((i) => i.id));
    expect(done).toEqual({ moved: 4, forgotten: 2 });
    const lora = path.join(models, "loras", "style");
    expect((await fs.readdir(lora)).sort()).toEqual([
      "config.json",
      "kept.civitai.info",
      "kept.safetensors",
    ]);
    expect((await pictures.all()).map((p) => p.name)).toEqual(["colors"]);
    expect((await leftovers.scan()).items).toEqual([]);
    // In the trash, the folders below the models folder are kept, not the whole path.
    const trash = path.join(profiles.dir(profiles.active as string), "trash", "leftovers");
    const [stamp] = await fs.readdir(trash);
    const files = (await fs.readdir(path.join(trash, stamp as string), { recursive: true }))
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => f.endsWith("gone.civitai.info"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[^/]+-models\/loras\/style\/gone\.civitai\.info$/);
  });

  it("skips a folder that isn't there instead of judging it", async () => {
    await fs.rename(wildcards, `${wildcards}-away`);
    await pictures.set("orphan-while-away", await png());
    const report = await leftovers.scan();
    expect(report.skipped).toEqual([wildcards]);
    expect(report.items.some((i) => i.kind === "wildcard-picture")).toBe(false);
    await fs.rename(`${wildcards}-away`, wildcards);
    await pictures.remove("orphan-while-away");
  });
});

describe("wildcard pictures", () => {
  it("follow renames of a wildcard and of a folder", async () => {
    await pictures.set("outfits/fantasy", await png());
    await pictures.rename([{ kind: "wildcard", from: "colors", to: "palette", folder: false }]);
    await pictures.rename([{ kind: "wildcard", from: "outfits", to: "clothes", folder: true }]);
    expect((await pictures.all()).map((p) => p.name).sort()).toEqual([
      "clothes/fantasy",
      "palette",
    ]);
    expect(Object.keys(await pictures.urls()).sort()).toEqual(["clothes/fantasy", "palette"]);
  });
});
