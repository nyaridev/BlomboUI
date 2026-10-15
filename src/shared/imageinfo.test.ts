import { describe, expect, it } from "vitest";
import { a1111SamplerToComfy, a1111Summary, parseA1111 } from "./imageinfo.ts";

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
