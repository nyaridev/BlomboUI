import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiPrompt, ObjectInfo } from "../../../shared/workflow/graph.ts";
import { analyze } from "./analyze.ts";
import { CompileError, compile, resolveLoraFile } from "./compile.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) =>
  ApiPrompt.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")));
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(dir, "object_info.json"), "utf8")),
);
const LORAS = [
  "detail_tweaker.safetensors",
  "SDXL\\Detail Slider XL.safetensors",
  "styles/ghibli_bg.safetensors",
];
const wildcards = (name: string) => (name === "weather" ? ["rain", "snow"] : undefined);

function setup(name: string) {
  const prompt = load(name);
  const a = analyze(prompt, info);
  return { prompt, manifest: { bindings: a.bindings }, values: a.values };
}

describe("compile", () => {
  it("applies values, the seed, wildcards and the filename prefix", () => {
    const { prompt, manifest, values } = setup("sd15-api");
    const out = compile({
      manifest,
      prompt,
      values: { ...values, "sampler.steps": "30", "latent.width": 640 },
      seed: 123,
      wildcards,
      loraFiles: LORAS,
      filenamePrefix: "%year%/sd15",
    });
    expect(out.prompt["3"]?.inputs).toMatchObject({ steps: 30, seed: 123 });
    expect(out.prompt["5"]?.inputs.width).toBe(640);
    expect(out.prompt["6"]?.inputs.text).toMatch(/^a cozy cabin in the woods, (rain|snow)$/);
    expect(out.prompt["9"]?.inputs.filename_prefix).toBe("%year%/sd15");
    // The source graph is untouched.
    expect(prompt["3"]?.inputs.steps).toBe(25);
  });

  it("is deterministic per seed", () => {
    const { prompt, manifest, values } = setup("sd15-api");
    const run = (seed: number) =>
      compile({ manifest, prompt, values, seed, wildcards, loraFiles: LORAS, filenamePrefix: "x" })
        .texts["prompt.positive"];
    expect(run(5)).toBe(run(5));
  });

  it("keeps a filename prefix the graph set on purpose", () => {
    const { prompt, manifest, values } = setup("sdxl-api");
    const out = compile({
      manifest,
      prompt,
      values,
      seed: 1,
      wildcards,
      loraFiles: LORAS,
      filenamePrefix: "x",
    });
    expect(out.prompt["8"]?.inputs.filename_prefix).toBe("knights");
    expect(out.prompt["12"]?.inputs.value).toBe(1);
  });

  it("moves <lora:…> tags into a loader chain after the checkpoint", () => {
    const { prompt, manifest, values } = setup("sd15-api");
    const out = compile({
      manifest,
      prompt,
      values: {
        ...values,
        "prompt.positive": "cabin, <lora:detail_tweaker:0.7>, <lora:Detail Slider XL:1:0.5>",
      },
      seed: 1,
      wildcards,
      loraFiles: LORAS,
      filenamePrefix: "x",
    });
    expect(out.texts["prompt.positive"]).toBe("cabin");
    expect(out.loras).toEqual([
      { file: "detail_tweaker.safetensors", strength: 0.7, clipStrength: 0.7 },
      { file: "SDXL\\Detail Slider XL.safetensors", strength: 1, clipStrength: 0.5 },
    ]);
    const first = out.prompt["10"];
    const second = out.prompt["11"];
    expect(first).toMatchObject({
      class_type: "LoraLoader",
      inputs: { model: ["4", 0], clip: ["4", 1] },
    });
    expect(second?.inputs).toMatchObject({ model: ["10", 0], clip: ["10", 1], strength_clip: 0.5 });
    // Everything that used the checkpoint's model and CLIP now uses the last LoRA.
    expect(out.prompt["3"]?.inputs.model).toEqual(["11", 0]);
    expect(out.prompt["6"]?.inputs.clip).toEqual(["11", 1]);
    expect(out.prompt["7"]?.inputs.clip).toEqual(["11", 1]);
    // The VAE output of the checkpoint is left alone.
    expect(out.prompt["8"]?.inputs.vae).toEqual(["4", 2]);
  });

  it("adds tags to an rgthree stack instead of new nodes", () => {
    const { prompt, manifest, values } = setup("rgthree-lora-api");
    const out = compile({
      manifest,
      prompt,
      values: { ...values, "prompt.positive": "1girl <lora:detail_tweaker:0.4>" },
      seed: 1,
      wildcards,
      loraFiles: LORAS,
      filenamePrefix: "x",
    });
    expect(Object.keys(out.prompt)).toHaveLength(Object.keys(prompt).length);
    expect(out.prompt["2"]?.inputs.lora_2).toEqual({
      on: true,
      lora: "detail_tweaker.safetensors",
      strength: 0.4,
      strengthTwo: null,
    });
  });

  it("explains missing LoRAs and wildcards", () => {
    const { prompt, manifest, values } = setup("sd15-api");
    const base = { manifest, prompt, seed: 1, wildcards, loraFiles: LORAS, filenamePrefix: "x" };
    expect(() =>
      compile({ ...base, values: { ...values, "prompt.positive": "<lora:nope>" } }),
    ).toThrow(CompileError);
    expect(() =>
      compile({ ...base, values: { ...values, "prompt.positive": "__colors__" } }),
    ).toThrow(/colors\.txt/);
  });
});

describe("resolveLoraFile", () => {
  it("matches by name, path or file, ignoring case and slashes", () => {
    expect(resolveLoraFile("detail_tweaker", LORAS)).toBe("detail_tweaker.safetensors");
    expect(resolveLoraFile("sdxl/detail slider xl", LORAS)).toBe(
      "SDXL\\Detail Slider XL.safetensors",
    );
    expect(resolveLoraFile("ghibli_bg", LORAS)).toBe("styles/ghibli_bg.safetensors");
    expect(resolveLoraFile("missing", LORAS)).toBeNull();
    expect(resolveLoraFile("anything", null)).toBe("anything.safetensors");
  });
});
