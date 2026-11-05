import { describe, expect, it } from "vitest";
import { parseMeta } from "./meta.ts";

// What Civitai's generator saves in a JPEG's comment: the graph, plus its own record beside it.
const civitai = {
  ckpt: {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "urn:air:sdxl:checkpoint:civitai:827184@1761560" },
  },
  lora: {
    class_type: "LoraLoader",
    inputs: {
      lora_name: "urn:air:sdxl:lora:civitai:1773874@2175773",
      strength_model: 1,
      strength_clip: 1,
      model: ["ckpt", 0],
      clip: ["ckpt", 1],
    },
  },
  "6": {
    class_type: "smZ CLIPTextEncode",
    inputs: { text: "1girl, ice cream", parser: "A1111", clip: ["lora", 1] },
  },
  "7": {
    class_type: "smZ CLIPTextEncode",
    inputs: { text: "bad quality", parser: "A1111", clip: ["lora", 1] },
  },
  "11": {
    class_type: "KSampler",
    inputs: {
      sampler_name: "euler_ancestral",
      scheduler: "normal",
      seed: 465830932,
      steps: 29,
      cfg: 5,
      denoise: 0.6,
      model: ["lora", 0],
      positive: ["6", 0],
      negative: ["7", 0],
    },
  },
  extra: { airs: ["urn:air:sdxl:checkpoint:civitai:827184@1761560"] },
  extraMetadata: JSON.stringify({
    prompt: "1girl, ice cream",
    negativePrompt: "bad quality",
    steps: 29,
    cfgScale: 5,
    sampler: "euler_ancestral",
    seed: 465830932,
    resources: [{ modelVersionId: 1761560, strength: 1 }],
  }),
};

describe("parseMeta", () => {
  it("reads a Civitai generator graph: its texts, not the whole chunk", () => {
    const meta = parseMeta({ prompt: JSON.stringify(civitai) });
    expect(meta.hasWorkflow).toBe(true);
    expect(meta.summary).toMatchObject({
      source: "civitai",
      prompt: "1girl, ice cream",
      negative: "bad quality",
      seed: 465830932,
      steps: 29,
      cfg: 5,
      sampler: "euler_ancestral",
    });
    expect(meta.settings.roles["prompt.positive"]).toBe("1girl, ice cream");
    expect(meta.settings.roles["prompt.negative"]).toBe("bad quality");
  });

  it("still reads A1111 text", () => {
    const meta = parseMeta({ parameters: "a cat\nNegative prompt: dog\nSteps: 5, Seed: 7" });
    expect(meta.summary).toMatchObject({ source: "a1111", prompt: "a cat", negative: "dog" });
  });
});
