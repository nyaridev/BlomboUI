import { describe, expect, it } from "vitest";
import {
  a1111SamplerToComfy,
  a1111ScheduleToComfy,
  a1111Summary,
  civitaiSummary,
  modelKey,
  parseA1111,
  usedModels,
} from "./imageinfo.ts";

const SAMPLE = `masterpiece, 1girl, <lora:Detailer:0.8>, silver hair
Negative prompt: lowres, bad hands
Steps: 28, Sampler: DPM++ 2M Karras, CFG scale: 5.5, Seed: 284119032, Size: 832x1216, Model hash: abc123, Model: waiIllustrious_v14, Clip skip: 2, Lora hashes: "Detailer: 1a2b, Other: 3c4d", Version: f2.0`;

describe("parseA1111", () => {
  it("splits prompt, negative and settings", () => {
    const p = parseA1111(SAMPLE);
    expect(p?.positive).toBe("masterpiece, 1girl, <lora:Detailer:0.8>, silver hair");
    expect(p?.negative).toBe("lowres, bad hands");
    expect(p?.settings).toContainEqual(["Lora hashes", "Detailer: 1a2b, Other: 3c4d"]);
    expect(p?.settings).toContainEqual(["Version", "f2.0"]);
  });

  it("handles a prompt without settings", () => {
    expect(parseA1111("just a prompt")).toEqual({
      positive: "just a prompt",
      negative: "",
      settings: [],
    });
  });

  it("turns settings into a summary and role values", () => {
    const p = parseA1111(SAMPLE);
    if (!p) throw new Error("no parse");
    const { summary, roles } = a1111Summary(p);
    expect(summary).toMatchObject({
      source: "a1111",
      model: "waiIllustrious_v14",
      seed: 284119032,
      steps: 28,
      cfg: 5.5,
      width: 832,
      height: 1216,
      loras: [{ name: "Detailer", strength: 0.8 }],
    });
    expect(roles).toMatchObject({
      "sampler.name": "dpmpp_2m",
      "sampler.scheduler": "karras",
      "clip.skip": -2,
      "latent.width": 832,
    });
  });
});

describe("a1111SamplerToComfy", () => {
  it("maps names and schedulers", () => {
    expect(a1111SamplerToComfy("Euler a")).toEqual({ sampler: "euler_ancestral", scheduler: null });
    expect(a1111SamplerToComfy("DPM++ 2M SDE Karras")).toEqual({
      sampler: "dpmpp_2m_sde",
      scheduler: "karras",
    });
    expect(a1111SamplerToComfy("Mystery")).toEqual({ sampler: "Mystery", scheduler: null });
  });
});

describe("A1111 schedule type", () => {
  it("uses Schedule type when the sampler name has no scheduler", () => {
    const text =
      "a cat\nNegative prompt: blurry\nSteps: 20, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 7, Seed: 1, Size: 512x768";
    expect(
      a1111Summary(parseA1111(text) as NonNullable<ReturnType<typeof parseA1111>>).roles[
        "sampler.scheduler"
      ],
    ).toBe("karras");
    expect(a1111ScheduleToComfy("Automatic")).toBeNull();
    expect(a1111ScheduleToComfy("SGM Uniform")).toBe("sgm_uniform");
  });
});

describe("usedModels", () => {
  it("lists the checkpoint and LoRAs with the hashes A1111 wrote", () => {
    const p = parseA1111(
      `cat, <lora:styles/Detailer:0.8>, <lora:Plain:1>
Steps: 20, Model hash: 0123abcd45, Model: waiIllustrious_v14, Lora hashes: "Detailer: 1a2b3c4d5e6f, Other: 99887766aa"`,
    );
    if (!p) throw new Error("not parsed");
    expect(usedModels(a1111Summary(p).summary, p.settings)).toEqual([
      { kind: "checkpoint", name: "waiIllustrious_v14", strength: null, hash: "0123ABCD45" },
      { kind: "lora", name: "styles/Detailer", strength: 0.8, hash: "1A2B3C4D5E6F" },
      { kind: "lora", name: "Plain", strength: 1, hash: null },
    ]);
  });

  it("compares model names by file name", () => {
    expect(modelKey("sdxl\\Juggernaut XL.safetensors")).toBe("juggernaut xl");
    expect(modelKey("Juggernaut XL")).toBe("juggernaut xl");
  });
});

describe("civitaiSummary", () => {
  it("reads what a poster shared, with LoRAs from the prompt or Civitai's resources", () => {
    const { summary, roles } = civitaiSummary({
      prompt: "a fox",
      negativePrompt: "blurry",
      steps: 30,
      cfgScale: 5.5,
      sampler: "Euler a",
      seed: 9,
      Size: "832x1216",
      Model: "someCheckpoint",
      resources: [
        { name: "fox_style", type: "lora", weight: 0.6 },
        { name: "x", type: "model" },
      ],
    });
    expect(summary).toMatchObject({
      source: "civitai",
      prompt: "a fox",
      negative: "blurry",
      steps: 30,
      cfg: 5.5,
      seed: 9,
      width: 832,
      height: 1216,
      model: "someCheckpoint",
      loras: [{ name: "fox_style", strength: 0.6 }],
    });
    expect(roles["sampler.steps"]).toBe(30);
    expect(civitaiSummary({ prompt: "<lora:own:0.5> cat", resources: [] }).summary.loras).toEqual([
      { name: "own", strength: 0.5 },
    ]);
  });
});
