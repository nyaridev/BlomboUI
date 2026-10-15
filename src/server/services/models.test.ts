import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../config.ts";
import { realPng } from "../lib/test-images.ts";
import { ModelService } from "./models.ts";
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
  await put("loras/style/Detailer.preview.png", await realPng(30, 40));
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
      nsfw: true,
      triggerWords: ["detailed", "sharp"],
      hasInfo: true,
    });
    expect(lora?.thumb).toMatch(/^\/api\/models\/thumb\?id=/);
    expect(list.models.find((m) => m.file === "plain.safetensors")).toMatchObject({
      triggerWords: ["foo", "bar"],
      thumb: null,
      nsfw: false,
    });
  });

  it("shows details with the safetensors header", async () => {
    const d = await models.details("loras/style/Detailer.safetensors");
    expect(d.civitai).toMatchObject({
      modelId: 111,
      versionId: 222,
      url: "https://civitai.com/models/111?modelVersionId=222",
    });
    expect(d.header?.training.dim).toBe("16");
    expect(d.sidecars.sort()).toEqual(["Detailer.civitai.info", "Detailer.preview.png"]);
    expect(d.folders).toEqual(["style"]);
    expect((await models.details("loras/plain.safetensors")).weight).toBe(0.7);
  });

  it("makes thumbnails from sidecar images", async () => {
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
      "Detailer v2.preview.png",
      "Detailer v2.safetensors",
    ]);
    expect(changed).toBe(1);
    await expect(models.rename("loras/plain.safetensors", "../evil")).rejects.toThrow();
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
});
