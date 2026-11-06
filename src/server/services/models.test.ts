import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { realPng } from "../lib/test-images.ts";
import { infoHash, ModelService, sidecarsFor } from "./models.ts";
import { ProfileService } from "./profiles.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-models-"));
const root = path.join(tmp, "models");
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const profiles = new ProfileService(config);
let changed = 0;
const models = new ModelService({
  profiles,
  runtimeDir: config.runtimeDir,
  onChanged: () => {
    changed++;
  },
});

function safetensors(meta: Record<string, string>): Uint8Array {
  const json = new TextEncoder().encode(
    JSON.stringify({
      __metadata__: meta,
      "lora_unet_a.lora_down.weight": { dtype: "F16", shape: [4, 4], data_offsets: [0, 32] },
    }),
  );
  const out = new Uint8Array(8 + json.byteLength + 32);
  new DataView(out.buffer).setBigUint64(0, BigInt(json.byteLength), true);
  out.set(json, 8);
  return out;
}

async function put(rel: string, data: Uint8Array | string) {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

beforeAll(async () => {
  await put("loras/style/Detailer.safetensors", safetensors({ ss_network_dim: "16" }));
  await put("loras/style/Detailer_data/thumbs/global.jpg", await realPng(30, 40));
  await put("loras/style/Detailer_data/model_data.json", "{}");
  await put(
    "loras/style/Detailer.civitai.info",
    JSON.stringify({
      id: 222,
      modelId: 111,
      name: "v2",
      baseModel: "Illustrious",
      trainedWords: ["detailed", " sharp "],
      model: { name: "Detailer Slider", nsfw: false },
      images: [{ nsfwLevel: 8 }],
    }),
  );
  await put("loras/plain.safetensors", safetensors({}));
  // The old sidecar picture isn't read anymore.
  await put("loras/plain.preview.png", await realPng(30, 40));
  await put(
    "loras/plain.json",
    JSON.stringify({ "activation text": "foo, bar", "preferred weight": 0.7 }),
  );
  await put("checkpoints/base.ckpt", "x");
  await put("unet/flux.gguf", "x");
  await put("loras/readme.md", "ignored");
  const profile = await profiles.create({
    name: "Models test",
    accent: "blue",
    theme: "blombo",
    paths: { models: root, outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(profile.id);
});

afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("local models", () => {
  it("scans kinds, folder aliases and sidecars", async () => {
    const list = await models.list();
    expect(list.exists).toBe(true);
    expect(list.models.map((m) => [m.kind, m.id])).toEqual([
      ["checkpoints", "checkpoints/base.ckpt"],
      ["diffusion_models", "unet/flux.gguf"],
      ["loras", "loras/style/Detailer.safetensors"],
      ["loras", "loras/plain.safetensors"],
    ]);
    const lora = list.models.find((m) => m.file === "Detailer.safetensors");
    expect(lora).toMatchObject({
      name: "Detailer Slider",
      folder: "style",
      baseModel: "IL",
      triggerWords: ["detailed", "sharp"],
      hasInfo: true,
    });
    expect(lora?.thumb).toMatch(/^\/api\/models\/thumb\?id=/);
    expect(list.models.find((m) => m.file === "plain.safetensors")).toMatchObject({
      triggerWords: ["foo", "bar"],
      thumb: null,
    });
  });

  it("finds a picker's folder on disk and refuses ones outside the kind folder", async () => {
    expect(await models.folderPath("loras", "style")).toBe(path.join(root, "loras", "style"));
    await expect(models.folderPath("loras", "nope")).rejects.toThrow(/isn't in this profile/);
    await expect(models.folderPath("loras", "../checkpoints")).rejects.toThrow();
  });

  it("shows details with the safetensors header", async () => {
    const d = await models.details("loras/style/Detailer.safetensors");
    expect(d.civitai).toMatchObject({
      modelId: 111,
      versionId: 222,
      url: "https://civitai.com/models/111?modelVersionId=222",
    });
    expect(d.header?.training.dim).toBe("16");
    expect(d.sidecars.sort()).toEqual(["Detailer.civitai.info", "Detailer_data"]);
    expect(d.folders).toEqual(["style"]);
    expect((await models.details("loras/plain.safetensors")).weight).toBe(0.7);
  });

  it("makes thumbnails from the picture in the model's data folder", async () => {
    const file = await models.thumbFile("loras/style/Detailer.safetensors");
    expect((await fs.readFile(file)).subarray(8, 12).toString("latin1")).toBe("WEBP");
    await expect(models.thumbFile("loras/plain.safetensors")).rejects.toThrow(/No thumbnail/);
  });

  it("renames a model together with its sidecars", async () => {
    const m = await models.rename("loras/style/Detailer.safetensors", "Detailer v2");
    expect(m.id).toBe("loras/style/Detailer v2.safetensors");
    const files = (await fs.readdir(path.join(root, "loras", "style"))).sort();
    expect(files).toEqual([
      "Detailer v2.civitai.info",
      "Detailer v2.safetensors",
      "Detailer v2_data",
    ]);
    expect(
      (await fs.readdir(path.join(root, "loras", "style", "Detailer v2_data"))).sort(),
    ).toEqual(["model_data.json", "thumbs"]);
    expect(changed).toBe(1);
    await expect(models.rename("loras/plain.safetensors", "../evil")).rejects.toThrow();
  });

  it("tells ComfyUI's lists and the other windows on a rescan, as after a download", async () => {
    const before = changed;
    await models.list(true);
    expect(changed).toBe(before + 1);
    await models.list();
    expect(changed).toBe(before + 1);
  });

  it("moves a model inside its kind folder and refuses collisions", async () => {
    const m = await models.move("loras/plain.safetensors", "style");
    expect(m.id).toBe("loras/style/plain.safetensors");
    expect(await fs.readdir(path.join(root, "loras", "style"))).toContain("plain.json");
    await expect(models.move("loras/style/plain.safetensors", "../../outside")).rejects.toThrow();
    await put("loras/plain.safetensors", "other");
    await models.list(true);
    await expect(models.move("loras/style/plain.safetensors", "")).rejects.toThrow(
      /already exists/,
    );
    expect(await fs.readFile(path.join(root, "loras", "plain.safetensors"), "utf8")).toBe("other");
  });

  it("saves trigger words, strength and notes into the A1111 .json, keeping its other keys", async () => {
    const id = "loras/style/plain.safetensors";
    const json = path.join(root, "loras", "style", "plain.json");
    await fs.writeFile(
      json,
      JSON.stringify({
        "activation text": "foo, bar",
        "preferred weight": 0.7,
        "sd version": "XL",
      }),
    );
    await models.list(true);
    const d = await models.saveInfo({ id, triggerWords: ["blue hair", "smile"], notes: " soft " });
    expect(d).toMatchObject({ triggerWords: ["blue hair", "smile"], weight: 0.7, notes: "soft" });
    expect(JSON.parse(await fs.readFile(json, "utf8"))).toEqual({
      "activation text": "blue hair, smile",
      "preferred weight": 0.7,
      "sd version": "XL",
      notes: "soft",
    });
    await models.saveInfo({ id, weight: -1.5 });
    expect((await models.list()).models.find((m) => m.id === id)?.weight).toBe(-1.5);
    await models.saveInfo({ id, weight: null });
    expect((await models.details(id)).weight).toBeNull();
    // Instant by default with words at the start; both are saved as Blombo's own keys.
    expect(d).toMatchObject({ instant: true, triggerAt: "start" });
    expect(await models.saveInfo({ id, instant: false, triggerAt: "end" })).toMatchObject({
      instant: false,
      triggerAt: "end",
    });
    expect(JSON.parse(await fs.readFile(json, "utf8"))).toMatchObject({
      "instant lora": false,
      "trigger position": "end",
    });
    // The slider runs 0–2 until a range is saved; null goes back to it.
    expect(d.strengthRange).toEqual([0, 2]);
    expect((await models.saveInfo({ id, strengthRange: [-1, 1.5] })).strengthRange).toEqual([
      -1, 1.5,
    ]);
    expect(JSON.parse(await fs.readFile(json, "utf8"))["strength range"]).toEqual([-1, 1.5]);
    expect((await models.saveInfo({ id, strengthRange: null })).strengthRange).toEqual([0, 2]);
    expect(JSON.parse(await fs.readFile(json, "utf8"))).not.toHaveProperty("strength range");
    // Your words win over Civitai's.
    const civitai = "loras/style/Detailer v2.safetensors";
    expect((await models.saveInfo({ id: civitai, triggerWords: ["mine"] })).triggerWords).toEqual([
      "mine",
    ]);
    // A file that isn't JSON is never written over.
    await put("checkpoints/base.json", "{oops");
    await models.list(true);
    await expect(models.saveInfo({ id: "checkpoints/base.ckpt", notes: "x" })).rejects.toThrow(
      /isn't valid JSON/,
    );
    expect(await fs.readFile(path.join(root, "checkpoints", "base.json"), "utf8")).toBe("{oops");
  });

  it("replaces and removes a model's picture, keeping the old ones in the trash", async () => {
    const id = "checkpoints/base.ckpt";
    await models.setPicture(id, await realPng(40, 60));
    expect((await models.details(id)).picture).toBe(true);
    expect((await models.list()).models.find((m) => m.id === id)?.thumb).toMatch(/^\/api\/models/);
    await models.setPicture(id, await realPng(20, 30));
    // An image that can't be read leaves the current picture alone.
    await expect(models.setPicture(id, new TextEncoder().encode("not an image"))).rejects.toThrow(
      /isn't an image/,
    );
    expect((await models.details(id)).picture).toBe(true);
    await models.removePicture(id);
    expect((await models.details(id)).picture).toBe(false);
    const trash = path.join(profiles.dir(profiles.active as string), "trash", "model-pictures");
    expect(await fs.readdir(trash)).toHaveLength(2);
  });

  it("keeps pictures for scopes beside the global one, and trashes a deleted scope's", async () => {
    const id = "checkpoints/base.ckpt";
    const [a, b] = ["aaaaaaaaaaaa", "bbbbbbbbbbbb"];
    await models.setPicture(id, await realPng(40, 60), a);
    await models.setPicture(id, await realPng(40, 60), `${b}+${a}`);
    const listed = (await models.list()).models.find((m) => m.id === id);
    expect(listed?.thumb).toBeNull();
    expect(listed?.pictures.map((p) => p.key).sort()).toEqual([a, `${a}+${b}`]);
    expect(listed?.pictures[0]?.thumb).toContain("&scope=");
    // "+" in a query is a space: the combination key is encoded.
    expect(listed?.pictures.find((p) => p.key.includes("+"))?.thumb).toContain(`scope=${a}%2B${b}`);
    expect(await models.thumbFile(id, a)).toBeTruthy();
    await expect(models.thumbFile(id)).rejects.toThrow(/No thumbnail/);

    expect(await models.removeScopePictures(b)).toBe(1);
    expect(
      (await models.list()).models.find((m) => m.id === id)?.pictures.map((p) => p.key),
    ).toEqual([a]);
    await models.removePicture(id, a);
    expect((await models.list()).models.find((m) => m.id === id)?.pictures).toEqual([]);
  });
});

describe("sidecarsFor", () => {
  it("leaves a longer model's sidecars alone", () => {
    const names = [
      "detail.safetensors",
      "detail.preview.png",
      "detail.civitai.info",
      "detail.xl.safetensors",
      "detail.xl.preview.png",
      "detail.xl.civitai.info",
    ];
    const files = new Map(names.map((n) => [n.toLowerCase(), n]));
    const stems = ["detail", "detail.xl"];
    const short = sidecarsFor("detail", files, "D:/m", stems);
    expect(short.all.sort()).toEqual(["detail.civitai.info", "detail.preview.png"]);
    const long = sidecarsFor("detail.xl", files, "D:/m", stems);
    expect(long.all.sort()).toEqual(["detail.xl.civitai.info", "detail.xl.preview.png"]);
  });

  it("renames a folder below a kind folder and refuses a taken name", async () => {
    await put("vae/old/a.safetensors", "x");
    await put("vae/taken/b.safetensors", "x");
    await expect(models.renameFolder("vae", "old", "taken")).rejects.toThrow(/already exists/);
    await models.renameFolder("vae", "old", "fresh");
    expect((await models.list()).models.map((m) => m.id)).toContain("vae/fresh/a.safetensors");
    await expect(models.renameFolder("vae", "fresh", "a/b")).rejects.toThrow(/without/);
  });

  it("serves the full-size picture when it's an image, not a video", async () => {
    await put("vae/pic.safetensors", "x");
    await put("vae/pic_data/thumbs/global_raw.png", await realPng(64, 32));
    await put("vae/clip.safetensors", "x");
    await put("vae/clip_data/thumbs/global_raw.mp4", "not a picture");
    models.invalidate();
    const list = await models.list();
    const pic = list.models.find((m) => m.id === "vae/pic.safetensors");
    expect(pic?.rawThumb).toMatch(/^\/api\/models\/picture\/raw\?id=/);
    expect((await models.rawPicture("vae/pic.safetensors")).type).toBe("image/png");
    expect(list.models.find((m) => m.id === "vae/clip.safetensors")?.rawThumb).toBeNull();
    await expect(models.rawPicture("vae/clip.safetensors")).rejects.toThrow(/full-size/);
  });
});

describe("infoHash", () => {
  const sha = (c: string) => c.repeat(64);
  it("takes the SHA256 of the file with its name, else the primary one", () => {
    const info = {
      files: [
        { name: "other.safetensors", primary: true, hashes: { SHA256: sha("a") } },
        { name: "Mine.safetensors", hashes: { SHA256: sha("b") } },
      ],
    };
    expect(infoHash(info, "mine.safetensors")).toBe(sha("B"));
    expect(infoHash(info, "renamed.safetensors")).toBe(sha("A"));
    expect(infoHash({ files: [{ hashes: { SHA256: "short" } }] }, "x")).toBeNull();
    expect(infoHash(null, "x")).toBeNull();
  });
});
