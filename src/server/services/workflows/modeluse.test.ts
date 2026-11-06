import { describe, expect, it } from "vitest";
import type { LocalModel } from "../../../shared/models.ts";
import type { ApiPrompt } from "../../../shared/workflow/graph.ts";
import { modelsInGraph } from "./modeluse.ts";

const local = [
  {
    id: "checkpoints/sdxl/base.safetensors",
    kind: "checkpoints",
    folder: "sdxl",
    file: "base.safetensors",
    sha256: "B".repeat(64),
    civitai: { modelId: 1, versionId: 11, lookup: false },
  },
  {
    id: "loras/style/detail.safetensors",
    kind: "loras",
    folder: "style",
    file: "detail.safetensors",
    sha256: null,
    civitai: null,
  },
] as unknown as LocalModel[];

describe("modelsInGraph", () => {
  it("lists every model file with the local model's hash and Civitai ids", () => {
    const prompt: ApiPrompt = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sdxl\\base.safetensors" },
      },
      "2": {
        class_type: "LoraLoader",
        inputs: { lora_name: "style/detail.safetensors", strength_model: 0.7, model: ["1", 0] },
      },
      "3": {
        class_type: "LoraLoader",
        inputs: { lora_name: "off.safetensors", strength_model: 0, model: ["2", 0] },
      },
      "4": {
        class_type: "Power Lora Loader (rgthree)",
        inputs: {
          lora_1: { on: true, lora: "missing.safetensors", strength: 0.4 },
          lora_2: { on: false, lora: "style/detail.safetensors", strength: 1 },
        },
      },
      "5": { class_type: "KSampler", inputs: { seed: 1, model: ["4", 0] } },
      "6": { class_type: "VAELoader", inputs: { vae_name: "sdxl_vae.safetensors" } },
    };
    expect(modelsInGraph(prompt, local)).toEqual([
      {
        kind: "checkpoints",
        name: "sdxl/base.safetensors",
        strength: null,
        sha256: "B".repeat(64),
        civitai: { modelId: 1, versionId: 11 },
      },
      {
        kind: "loras",
        name: "style/detail.safetensors",
        strength: 0.7,
        sha256: null,
        civitai: null,
      },
      { kind: "loras", name: "missing.safetensors", strength: 0.4, sha256: null, civitai: null },
      { kind: "vae", name: "sdxl_vae.safetensors", strength: null, sha256: null, civitai: null },
    ]);
  });
});
