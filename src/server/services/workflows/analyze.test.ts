import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiPrompt, ObjectInfo } from "../../../shared/workflow/graph.ts";
import type { Binding } from "../../../shared/workflow/manifest.ts";
import {
  analyze,
  countSamplers,
  findLoraSources,
  findLoraStack,
  refreshBindings,
} from "./analyze.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) =>
  ApiPrompt.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")));
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(dir, "object_info.json"), "utf8")),
);

const byRole = (bindings: Binding[]) =>
  Object.fromEntries(bindings.filter((b) => b.role).map((b) => [b.role, `${b.node}.${b.input}`]));

describe("analyze: SD 1.5", () => {
  const a = analyze(load("sd15-api"), info);

  it("finds every core role", () => {
    expect(byRole(a.bindings)).toEqual({
      "prompt.positive": "6.text",
      "prompt.negative": "7.text",
      "model.checkpoint": "4.ckpt_name",
      "sampler.name": "3.sampler_name",
      "sampler.scheduler": "3.scheduler",
      "sampler.steps": "3.steps",
      "sampler.cfg": "3.cfg",
      "sampler.seed": "3.seed",
      "latent.width": "5.width",
      "latent.height": "5.height",
      "latent.batch": "5.batch_size",
      "sampler.denoise": "3.denoise",
      "output.image": "9.filename_prefix",
    });
    expect(a.kind).toBe("generate");
    expect(a.findings).toEqual([]);
  });

  it("types bindings from object_info with comfortable ranges", () => {
    const get = (id: string) => a.bindings.find((b) => b.id === id);
    expect(get("sampler.steps")).toMatchObject({ type: "int", min: 1, max: 150, step: 1 });
    expect(get("sampler.cfg")).toMatchObject({ type: "float", min: 1, max: 20 });
    expect(get("sampler.name")?.options).toContain("dpmpp_2m");
    expect(get("model.checkpoint")).toMatchObject({ type: "model", modelKind: "checkpoints" });
    expect(get("prompt.positive")?.type).toBe("prompt");
    expect(get("sampler.seed")?.type).toBe("seed");
    // txt2img: denoise is meaningless, so it's hidden.
    expect(get("sampler.denoise")?.hidden).toBe(true);
    expect(get("output.image")?.hidden).toBe(true);
  });

  it("reads values from the graph", () => {
    expect(a.values).toMatchObject({
      "prompt.positive": "a cozy cabin in the woods, __weather__",
      "sampler.steps": 25,
      "sampler.cfg": 7,
      "latent.height": 768,
      "model.checkpoint": "sd15/dreamshaper_8.safetensors",
    });
  });

  it("still works without object_info, typing from values", () => {
    const bare = analyze(load("sd15-api"), null);
    expect(byRole(bare.bindings)["prompt.positive"]).toBe("6.text");
    expect(bare.bindings.find((b) => b.id === "sampler.steps")?.type).toBe("int");
    expect(bare.bindings.find((b) => b.id === "sampler.cfg")?.type).toBe("float");
  });
});

describe("analyze: SDXL with clip skip, separate VAE, a seed node and model patches", () => {
  const a = analyze(load("sdxl-api"), info);
  const roles = byRole(a.bindings);

  it("follows links to where values really live", () => {
    expect(roles["sampler.seed"]).toBe("12.value");
    expect(a.values["sampler.seed"]).toBe(1234);
    expect(roles["model.checkpoint"]).toBe("1.ckpt_name");
    expect(roles["clip.skip"]).toBe("2.stop_at_clip_layer");
    expect(roles["model.vae"]).toBe("10.vae_name");
    expect(a.values["latent.batch"]).toBe(2);
  });
});

describe("analyze: diffusion model (UNET + dual CLIP + VAE, custom sampler)", () => {
  const a = analyze(load("flux-unet-api"), info);
  const roles = byRole(a.bindings);

  it("finds the split sampler settings and loaders", () => {
    expect(roles).toMatchObject({
      "prompt.positive": "4.text",
      "model.unet": "1.unet_name",
      "model.clip": "2.clip_name1",
      "model.clip2": "2.clip_name2",
      "model.vae": "3.vae_name",
      "sampler.seed": "7.noise_seed",
      "sampler.name": "8.sampler_name",
      "sampler.scheduler": "9.scheduler",
      "sampler.steps": "9.steps",
      "latent.width": "10.width",
    });
    expect(roles["prompt.negative"]).toBeUndefined();
    expect(roles["sampler.cfg"]).toBeUndefined();
    expect(a.bindings.find((b) => b.role === "model.unet")?.modelKind).toBe("diffusion_models");
  });
});

describe("analyze: rgthree Power Lora Loader", () => {
  const prompt = load("rgthree-lora-api");
  const a = analyze(prompt, info);

  it("marks the stack and traces through it", () => {
    const stack = a.bindings.find((b) => b.role === "lora.stack");
    expect(stack).toMatchObject({ node: "2", type: "loras", hidden: true });
    expect(byRole(a.bindings)["model.checkpoint"]).toBe("1.ckpt_name");
    expect(byRole(a.bindings)["prompt.positive"]).toBe("3.text");
    expect(findLoraStack(prompt)).toBe("2");
  });
});

describe("analyze: $-titled nodes", () => {
  const a = analyze(load("dollar-titles-api"), info);

  it("exposes their widgets with the title as the label", () => {
    expect(a.bindings.find((b) => b.role === "prompt.positive")?.label).toBe("Prompt");
    const sharpen = a.bindings.filter((b) => b.node === "7");
    expect(sharpen.map((b) => [b.id, b.label, b.group, b.type])).toEqual([
      ["n7.sharpen_radius", "Sharpen · Sharpen radius", "Sharpen", "int"],
      ["n7.sigma", "Sharpen · Sigma", "Sharpen", "float"],
      ["n7.alpha", "Sharpen · Alpha", "Sharpen", "float"],
    ]);
    expect(a.values["n7.sigma"]).toBe(0.8);
  });

  it("labels a $-titled image input by its title", () => {
    expect(a.bindings.find((b) => b.role === "image.input")).toMatchObject({
      node: "8",
      label: "Reference",
      type: "image",
    });
  });
});

describe("findings", () => {
  it("reports missing custom nodes and models", () => {
    const prompt = load("sd15-api");
    prompt["4"]!.inputs.ckpt_name = "gone.safetensors";
    prompt["20"] = { class_type: "SomeCustomNode", inputs: {} };
    const a = analyze(prompt, info);
    expect(a.findings.map((f) => f.code).sort()).toEqual(["missing_model", "missing_node"]);
  });

  it("warns when there is no output", () => {
    const prompt = load("sd15-api");
    delete prompt["9"];
    expect(analyze(prompt, info).findings.some((f) => f.code === "no_output")).toBe(true);
  });
});

describe("graph helpers", () => {
  it("finds LoRA attachment points after the loaders", () => {
    expect(findLoraSources(load("sd15-api"))).toEqual({ model: ["4", 0], clip: ["4", 1] });
    expect(findLoraSources(load("sdxl-api"))).toEqual({ model: ["1", 0], clip: ["1", 1] });
    expect(findLoraSources(load("flux-unet-api"))).toEqual({ model: ["1", 0], clip: ["2", 0] });
  });

  it("counts sampler passes", () => {
    expect(countSamplers(load("sd15-api"))).toBe(1);
    expect(countSamplers(load("flux-unet-api"))).toBe(1);
  });

  it("refreshes choices from object_info", () => {
    const prompt = load("sd15-api");
    const stale = analyze(prompt, null).bindings;
    const fresh = refreshBindings(stale, prompt, info);
    expect(fresh.find((b) => b.id === "model.checkpoint")?.options).toHaveLength(3);
  });
});
