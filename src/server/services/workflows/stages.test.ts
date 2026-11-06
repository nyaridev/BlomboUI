import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ApiPrompt,
  ApiPrompt as ApiPromptSchema,
  isApiLink,
  ObjectInfo,
} from "../../../shared/workflow/graph.ts";
import { readStages, type StageSettings } from "../../../shared/workflow/stages.ts";
import { analyze, findPorts } from "./analyze.ts";
import { CompileError, compile } from "./compile.ts";
import { listStagePackages } from "./presets.ts";
import { applyStages, type LoadedStage, sourceModes } from "./stages.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "fixtures");
const presetsDir = path.join(here, "..", "..", "..", "..", "presets");
/** A fixture graph, or a built-in preset's (`preset:wan22-5b`). */
const load = (name: string) =>
  ApiPromptSchema.parse(
    JSON.parse(
      fs.readFileSync(
        name.startsWith("preset:")
          ? path.join(presetsDir, "workflows", name.slice(7), "prompt.json")
          : path.join(dir, `${name}.json`),
        "utf8",
      ),
    ),
  );
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(dir, "object_info.json"), "utf8")),
);
const LORAS = ["detail_tweaker.safetensors", "face_fix.safetensors"];
const IMAGE = {
  file: "0123456789abcdef.png",
  source: "upload",
  label: "pose.png",
  width: 512,
  height: 768,
} as const;

let packages: LoadedStage[] = [];
beforeAll(async () => {
  packages = await listStagePackages(presetsDir);
});

function setup(name: string, stages: unknown) {
  const prompt = load(name);
  const a = analyze(prompt, info);
  return {
    manifest: { bindings: a.bindings },
    prompt,
    values: a.values,
    stages: readStages(stages),
  };
}

function run(name: string, stages: unknown, extra: Partial<Parameters<typeof compile>[0]> = {}) {
  const s = setup(name, stages);
  return compile({
    manifest: s.manifest,
    prompt: s.prompt,
    values: s.values,
    seed: 42,
    wildcards: (name: string) => (name === "weather" ? ["rain"] : undefined),
    loraFiles: LORAS,
    filenamePrefix: "day/wf",
    stages: s.stages,
    stagePackages: packages,
    stageImages: { [IMAGE.file]: "blombo/0123456789abcdef.png" },
    objectInfo: info,
    ...extra,
  });
}

/** Every link points at a node that exists, and no stub or OUT node is left over. */
function expectValidGraph(prompt: ApiPrompt) {
  for (const [id, node] of Object.entries(prompt)) {
    expect(node.class_type, id).not.toMatch(/^(PORT|OUT):/);
    expect(info[node.class_type], `${id} ${node.class_type}`).toBeDefined();
    for (const [input, v] of Object.entries(node.inputs))
      if (isApiLink(v)) expect(prompt[String(v[0])], `${id}.${input} → ${v[0]}`).toBeDefined();
    expect(JSON.stringify(node._meta ?? {})).not.toContain("blombo");
  }
}

const byClass = (prompt: ApiPrompt, cls: string) =>
  Object.entries(prompt).filter(([, n]) => n.class_type === cls);
const one = (prompt: ApiPrompt, cls: string) => {
  const found = byClass(prompt, cls);
  expect(found, cls).toHaveLength(1);
  return found[0] as [string, ApiPrompt[string]];
};

describe("stage packages", () => {
  it("load from presets/stages for both families", () => {
    const ids = packages.map((p) => p.pkg.id).sort();
    expect(ids).toEqual([
      "adetailer-checkpoint",
      "adetailer-diffusion",
      "controlnet-checkpoint",
      "controlnet-diffusion",
      "hires-checkpoint",
      "hires-diffusion",
      "smooth",
      "source",
      "source-ltx2",
      "source-ltx2-extend",
      "source-ltx2-flf",
      "source-minimax-h3",
      "source-minimax-h3-extend",
      "source-minimax-h3-flf",
      "source-scail2-extend",
      "source-wan22",
      "source-wan22-14b",
      "source-wan22-14b-extend",
      "source-wan22-14b-flf",
      "source-wan22-extend",
      "source-wan22-fun",
    ]);
  });

  it("only use classes ComfyUI (or the named packs) define", () => {
    for (const { pkg, graph } of packages)
      for (const node of Object.values(graph)) {
        if (/^(PORT|OUT):/.test(node.class_type)) continue;
        expect(info[node.class_type], `${pkg.id}: ${node.class_type}`).toBeDefined();
      }
  });

  it("pin every pack, at the same commit wherever it's listed (so Install can fetch it)", () => {
    const refs = new Map<string, string>();
    for (const { pkg } of packages)
      for (const pack of pkg.packs) {
        expect(pack.ref, `${pkg.id}: ${pack.name}`).toMatch(/^[0-9a-f]{40}$/);
        const seen = refs.get(pack.url);
        if (seen) expect(pack.ref, `${pkg.id}: ${pack.name}`).toBe(seen);
        else refs.set(pack.url, pack.ref as string);
      }
    expect(refs.size).toBe(3);
  });
});

describe("ports", () => {
  it("are found in checkpoint and diffusion graphs", () => {
    expect(findPorts(load("sd15-api"))).toMatchObject({
      MODEL: ["4", 0],
      CLIP: ["4", 1],
      VAE: ["4", 2],
      POSITIVE: ["6", 0],
      NEGATIVE: ["7", 0],
      START: ["5", 0],
      LATENT: ["3", 0],
      IMAGE: ["8", 0],
    });
    const flux = findPorts(load("flux-unet-api"));
    expect(flux).toMatchObject({
      MODEL: ["1", 0],
      CLIP: ["2", 0],
      VAE: ["3", 0],
      POSITIVE: ["5", 0],
    });
    expect(flux.NEGATIVE).toBeUndefined();
    expect(flux.IMAGE).toEqual(["12", 0]);
  });
});

describe("image to image and inpaint (the source stage)", () => {
  const MASK = { ...IMAGE, file: "fedcba9876543210.png", label: "mask.png" };
  const images = {
    [IMAGE.file]: "blombo/0123456789abcdef.png",
    [MASK.file]: "blombo/fedcba9876543210.png",
  };

  it("starts the main sampler from the encoded image, fitted to the size, at its denoise", () => {
    const out = run("sd15-api", { source: { mode: "img2img", image: IMAGE, denoise: 0.6 } });
    const p = out.prompt;
    expectValidGraph(p);
    const [loadId, load] = one(p, "LoadImage");
    expect(load.inputs.image).toBe("blombo/0123456789abcdef.png");
    const [scaleId, scale] = one(p, "ImageScale");
    expect(scale.inputs).toMatchObject({ image: [loadId, 0], crop: "center" });
    expect(scale.inputs.width).toBe(p["5"]?.inputs.width);
    expect(scale.inputs.height).toBe(p["5"]?.inputs.height);
    const [encId, enc] = one(p, "VAEEncode");
    expect(enc.inputs).toMatchObject({ pixels: [scaleId, 0], vae: ["4", 2] });
    expect(p["3"]?.inputs).toMatchObject({ latent_image: [encId, 0], denoise: 0.6 });
    expect(byClass(p, "LoadImageMask")).toEqual([]);
    expect(byClass(p, "SetLatentNoiseMask")).toEqual([]);
    expect(out.segments.map((s) => s.id)).toEqual(["base"]);
  });

  it("inpaints: only the painted part is redrawn, the mask grown, fitted and softened", () => {
    const p = run(
      "sd15-api",
      { source: { mode: "inpaint", image: IMAGE, mask: MASK, grow: 10, blur: 6 } },
      { stageImages: images },
    ).prompt;
    expectValidGraph(p);
    const [maskLoadId, maskLoad] = one(p, "LoadImageMask");
    expect(maskLoad.inputs).toMatchObject({ image: "blombo/fedcba9876543210.png", channel: "red" });
    const [growId, grow] = one(p, "GrowMask");
    expect(grow.inputs).toMatchObject({ mask: [maskLoadId, 0], expand: 10 });
    const [toImageId] = one(p, "MaskToImage");
    expect(p[toImageId]?.inputs.mask).toEqual([growId, 0]);
    const scales = byClass(p, "ImageScale");
    expect(scales).toHaveLength(2);
    const [blurId, blur] = one(p, "ImageBlur");
    expect(blur.inputs).toMatchObject({ blur_radius: 6, sigma: 3 });
    const [maskId, mask] = one(p, "ImageToMask");
    expect(mask.inputs.image).toEqual([blurId, 0]);
    const [encId] = one(p, "VAEEncode");
    const [noiseId, noise] = one(p, "SetLatentNoiseMask");
    expect(noise.inputs).toEqual({ samples: [encId, 0], mask: [maskId, 0] });
    expect(p["3"]?.inputs).toMatchObject({ latent_image: [noiseId, 0], denoise: 0.75 });
  });

  it("repeats the latent for a batch, and works on diffusion graphs (denoise on the scheduler)", () => {
    const batch = run("sd15-api", { source: { mode: "img2img", image: IMAGE } });
    expect(byClass(batch.prompt, "RepeatLatentBatch")).toEqual([]);
    const s = setup("sd15-api", { source: { mode: "img2img", image: IMAGE } });
    const b = s.manifest.bindings.find((x) => x.role === "latent.batch");
    expect(b).toBeDefined();
    const four = run(
      "sd15-api",
      { source: { mode: "img2img", image: IMAGE } },
      { values: { ...s.values, [b?.id ?? ""]: 4 } },
    ).prompt;
    const [repeatId, repeat] = one(four, "RepeatLatentBatch");
    expect(repeat.inputs.amount).toBe(4);
    expect(four["3"]?.inputs.latent_image).toEqual([repeatId, 0]);

    const flux = run("flux-unet-api", {
      source: { mode: "img2img", image: IMAGE, denoise: 0.5 },
    }).prompt;
    expectValidGraph(flux);
    const [encId] = one(flux, "VAEEncode");
    expect(flux["11"]?.inputs.latent_image).toEqual([encId, 0]);
    expect(flux["9"]?.inputs.denoise).toBe(0.5);
  });

  it("does nothing for text to image, and stops without an image or a mask", () => {
    const plain = run("sd15-api", { source: { mode: "txt2img", image: IMAGE } }).prompt;
    expect(byClass(plain, "LoadImage")).toEqual([]);
    expect(plain["3"]?.inputs.latent_image).toEqual(["5", 0]);
    expect(() => run("sd15-api", { source: { mode: "img2img" } })).toThrow(
      "Image to image has no image.",
    );
    expect(() => run("sd15-api", { source: { mode: "inpaint", image: IMAGE } })).toThrow(
      "Inpaint has no mask.",
    );
  });
});

describe("video first pass (source packages for Wan and LTX)", () => {
  const LAST = { ...IMAGE, file: "fedcba9876543210.png", label: "last.png" };
  const images = {
    [IMAGE.file]: "blombo/0123456789abcdef.png",
    [LAST.file]: "blombo/fedcba9876543210.png",
  };
  const FUN = "wan2.2_fun_inpaint_5B_bf16.safetensors";
  /** The node id a link input points at. */
  const from = (v: unknown) => String((v as [string, number] | undefined)?.[0]);
  const withFun = structuredClone(info);
  const unet = withFun.UNETLoader?.input.required?.unet_name;
  if (unet && Array.isArray(unet[0])) unet[0] = [...(unet[0] as string[]), FUN];

  it("finds the video ports: Wan's VIDEO is its START, LTX's the video half of its latent", () => {
    expect(findPorts(load("preset:wan22-5b"))).toMatchObject({
      START: ["7", 0],
      VIDEO: ["7", 0],
      LATENT: ["8", 0],
      VAE: ["3", 0],
      IMAGE: ["9", 0],
    });
    expect(findPorts(load("preset:ltx23"))).toMatchObject({
      START: ["11", 0],
      VIDEO: ["9", 0],
      POSITIVE: ["8", 0],
      NEGATIVE: ["8", 1],
      LATENT: ["17", 0],
      VAE: ["1", 2],
      IMAGE: ["18", 0],
    });
    expect(findPorts(load("sd15-api")).VIDEO).toBeUndefined();
  });

  it("offers the modes whose package fits the workflow", () => {
    const modes = (name: string, media: "image" | "video") => {
      const prompt = load(name);
      return sourceModes(prompt, packages, analyze(prompt, info).bindings, media);
    };
    expect(modes("preset:wan22-5b", "video")).toEqual(["txt2img", "first", "firstLast", "extend"]);
    expect(modes("preset:ltx23", "video")).toEqual(["txt2img", "first", "firstLast", "extend"]);
    expect(modes("sd15-api", "image")).toEqual(["txt2img", "img2img", "inpaint"]);
    // A video model no package knows gets Text to video only.
    const other = load("preset:wan22-5b");
    if (other["7"]) other["7"].class_type = "SomeVideoLatent";
    expect(sourceModes(other, packages, analyze(other, info).bindings, "video")).toEqual([
      "txt2img",
    ]);
  });

  it("Wan first frame: a new latent with the start image, at the workflow's size and length", () => {
    const p = run("preset:wan22-5b", { source: { mode: "first", image: IMAGE } }).prompt;
    expectValidGraph(p);
    const [loadId, load] = one(p, "LoadImage");
    expect(load.inputs.image).toBe("blombo/0123456789abcdef.png");
    const latentId = from(p["8"]?.inputs.latent_image);
    expect(latentId).not.toBe("7");
    expect(p[latentId]?.inputs).toMatchObject({
      start_image: [loadId, 0],
      vae: ["3", 0],
      width: 1280,
      height: 704,
      length: 49,
      batch_size: 1,
    });
  });

  it("Wan first and last frame: Fun Inpaint's model, both frames and its conditioning", () => {
    const p = run(
      "preset:wan22-5b",
      { source: { mode: "firstLast", image: IMAGE, last: LAST } },
      { stageImages: images, objectInfo: withFun },
    ).prompt;
    expectValidGraph(p);
    const [funId, fun] = one(p, "WanFunInpaintToVideo");
    expect(fun.inputs).toMatchObject({
      positive: ["5", 0],
      negative: ["6", 0],
      vae: ["3", 0],
      length: 49,
    });
    const frames = byClass(p, "LoadImage").map(([, n]) => String(n.inputs.image));
    expect(frames.sort()).toEqual(["blombo/0123456789abcdef.png", "blombo/fedcba9876543210.png"]);
    const sampler = p["8"]?.inputs;
    expect(sampler).toMatchObject({
      positive: [funId, 0],
      negative: [funId, 1],
      latent_image: [funId, 2],
    });
    const shift = p[from(sampler?.model)];
    expect(shift?.class_type).toBe("ModelSamplingSD3");
    expect(p[from(shift?.inputs.model)]?.inputs.unet_name).toBe(FUN);
  });

  it("Wan first and last frame says so when the Fun Inpaint model isn't there", () => {
    expect(() =>
      run(
        "preset:wan22-5b",
        { source: { mode: "firstLast", image: IMAGE, last: LAST } },
        { stageImages: images },
      ),
    ).toThrow(FUN);
  });

  it("LTX first frame: written into the empty video latent before the audio joins it", () => {
    const p = run("preset:ltx23", { source: { mode: "first", image: IMAGE } }).prompt;
    expectValidGraph(p);
    const [putId, put] = one(p, "LTXVImgToVideoInplace");
    expect(put.inputs).toMatchObject({ latent: ["9", 0], vae: ["1", 2], strength: 1 });
    expect(p["11"]?.inputs.video_latent).toEqual([putId, 0]);
    const [, scale] = one(p, "ImageScale");
    expect(scale.inputs).toMatchObject({ width: 768, height: 512, crop: "center" });
    expect(byClass(p, "LTXVCropGuides")).toEqual([]);
  });

  it("LTX first and last frame: guides at the first and last frame, cropped before decoding", () => {
    const p = run(
      "preset:ltx23",
      { source: { mode: "firstLast", image: IMAGE, last: LAST } },
      { stageImages: images },
    ).prompt;
    expectValidGraph(p);
    const guides = byClass(p, "LTXVAddGuide");
    expect(guides.map(([, n]) => n.inputs.frame_idx)).toEqual([0, -1]);
    const [firstId, first] = guides[0] as [string, ApiPrompt[string]];
    const [lastId, last] = guides[1] as [string, ApiPrompt[string]];
    expect(first.inputs).toMatchObject({
      positive: ["8", 0],
      negative: ["8", 1],
      latent: ["9", 0],
    });
    expect(last.inputs).toMatchObject({
      positive: [firstId, 0],
      negative: [firstId, 1],
      latent: [firstId, 2],
    });
    expect(p["12"]?.inputs).toMatchObject({ positive: [lastId, 0], negative: [lastId, 1] });
    expect(p["11"]?.inputs.video_latent).toEqual([lastId, 2]);
    const [cropId, crop] = one(p, "LTXVCropGuides");
    expect(crop.inputs).toMatchObject({ positive: [lastId, 0], latent: ["17", 0] });
    expect(p["18"]?.inputs.samples).toEqual([cropId, 2]);
  });

  it("stops without the frames a mode needs, and checks Text to video as First frame", () => {
    expect(() => run("preset:wan22-5b", { source: { mode: "first" } })).toThrow(
      "First frame has no first frame.",
    );
    expect(() => run("preset:ltx23", { source: { mode: "firstLast", image: IMAGE } })).toThrow(
      "First and last frame has no last frame.",
    );
    const s = setup("preset:wan22-5b", { source: { mode: "txt2img" } });
    const status = applyStages(
      s.prompt,
      s.stages,
      packages,
      {
        bindings: s.manifest.bindings,
        values: s.values,
        seed: 1,
        wildcards: null,
        random: Math.random,
        loraFiles: "skip",
        images: null,
        filenamePrefix: "check",
        info,
      },
      "source",
    ).statuses[0];
    expect(status?.package).toBe("source-wan22");
    // Text to video itself leaves the graph alone.
    const plain = run("preset:wan22-5b", { source: { mode: "txt2img", image: IMAGE } }).prompt;
    expect(plain["8"]?.inputs.latent_image).toEqual(["7", 0]);
  });

  describe("MiniMax H3: one node makes the conditioning and the latent", () => {
    it("finds its ports on that node's two outputs, its prompt, and a length on its grid", () => {
      const prompt = load("preset:minimax-h3");
      expect(findPorts(prompt)).toMatchObject({
        POSITIVE: ["6", 0],
        START: ["6", 1],
        VIDEO: ["6", 1],
        LATENT: ["11", 0],
        IMAGE: ["12", 0],
      });
      const { bindings } = analyze(prompt, info);
      expect(bindings.find((b) => b.role === "prompt.positive")).toMatchObject({
        node: "6",
        input: "prompt",
      });
      // ComfyUI's grid (17k + 5 frames, sizes by 32) wins over the roles' steps and presets.
      const length = bindings.find((b) => b.role === "latent.length");
      expect(length).toMatchObject({ min: 5, step: 17 });
      expect(length?.presets).toBeUndefined();
      expect(bindings.find((b) => b.role === "latent.width")).toMatchObject({ step: 32 });
      expect(sourceModes(prompt, packages, bindings, "video")).toEqual([
        "txt2img",
        "first",
        "firstLast",
        "extend",
      ]);
    });

    it("First frame: the image, cropped to the video's size, goes into the node itself", () => {
      const p = run("preset:minimax-h3", { source: { mode: "first", image: IMAGE } }).prompt;
      expectValidGraph(p);
      const [loadId, loaded] = one(p, "LoadImage");
      expect(loaded.inputs.image).toBe(images[IMAGE.file]);
      // H3 stretches a first frame to the canvas; cropping first keeps its shape.
      const [scaleId, scale] = one(p, "ImageScale");
      expect(scale.inputs).toMatchObject({
        image: [loadId, 0],
        width: 1024,
        height: 576,
        crop: "center",
      });
      expect(p["6"]?.inputs.first_frame).toEqual([scaleId, 0]);
      expect(p["6"]?.inputs.last_frame).toBeUndefined();
      expect(p["11"]?.inputs.latent_image).toEqual(["6", 1]);
      expect(p["10"]?.inputs.conditioning).toEqual(["6", 0]);
    });

    it("First and last frame: both images go into it", () => {
      const p = run(
        "preset:minimax-h3",
        { source: { mode: "firstLast", image: IMAGE, last: LAST } },
        { stageImages: images },
      ).prompt;
      expectValidGraph(p);
      const scaled = (file: string) => {
        const load = byClass(p, "LoadImage").find(([, n]) => n.inputs.image === file)?.[0];
        return byClass(p, "ImageScale").find(([, n]) => from(n.inputs.image) === load)?.[0];
      };
      expect(p["6"]?.inputs.first_frame).toEqual([scaled(images[IMAGE.file] ?? ""), 0]);
      expect(p["6"]?.inputs.last_frame).toEqual([scaled(images[LAST.file] ?? ""), 0]);
    });
  });

  describe("Wan 2.2 14B: a high noise pass, then a low noise one", () => {
    const I2V = {
      high: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
      low: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
      loraHigh: "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
      loraLow: "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
    };
    const withI2v = structuredClone(info);
    const add = (cls: string, input: string, names: string[]) => {
      const spec = withI2v[cls]?.input.required?.[input];
      if (spec && Array.isArray(spec[0])) spec[0] = [...(spec[0] as string[]), ...names];
    };
    add("UNETLoader", "unet_name", [I2V.high, I2V.low]);
    add("LoraLoaderModelOnly", "lora_name", [I2V.loraHigh, I2V.loraLow]);

    it("decodes after the low noise pass and offers the frame modes only with Wan's files", () => {
      expect(findPorts(load("preset:wan22-14b"))).toMatchObject({
        MODEL: ["7", 0],
        START: ["11", 0],
        VIDEO: ["11", 0],
        LATENT: ["16", 0],
        VAE: ["4", 0],
        IMAGE: ["17", 0],
      });
      const modes = (prompt: ApiPrompt) =>
        sourceModes(prompt, packages, analyze(prompt, info).bindings, "video");
      expect(modes(load("preset:wan22-14b"))).toEqual(["txt2img", "first", "firstLast", "extend"]);
      // The same latent node with other models (HunyuanVideo, Wan 2.1): nothing to swap to.
      const other = load("preset:wan22-14b");
      for (const id of ["1", "2"]) if (other[id]) other[id].inputs.unet_name = "other.safetensors";
      for (const id of ["5", "6"]) if (other[id]) other[id].inputs.lora_name = "speed.safetensors";
      expect(modes(other)).toEqual(["txt2img"]);
    });

    it("First frame: both passes on the image to video models, WanImageToVideo before them", () => {
      const p = run(
        "preset:wan22-14b",
        { source: { mode: "first", image: IMAGE } },
        { objectInfo: withI2v },
      ).prompt;
      expectValidGraph(p);
      expect([1, 2, 5, 6].map((id) => Object.values(p[id]?.inputs ?? {})[0])).toEqual([
        I2V.high,
        I2V.low,
        I2V.loraHigh,
        I2V.loraLow,
      ]);
      const [videoId, video] = one(p, "WanImageToVideo");
      expect(video.inputs).toMatchObject({
        positive: ["9", 0],
        negative: ["10", 0],
        vae: ["4", 0],
        width: 640,
        height: 640,
        length: 81,
      });
      for (const pass of ["15", "16"])
        expect(p[pass]?.inputs).toMatchObject({ positive: [videoId, 0], negative: [videoId, 1] });
      expect(p["15"]?.inputs.latent_image).toEqual([videoId, 2]);
      expect(p["16"]?.inputs.latent_image).toEqual(["15", 0]);
    });

    it("First and last frame: WanFirstLastFrameToVideo with both frames", () => {
      const p = run(
        "preset:wan22-14b",
        { source: { mode: "firstLast", image: IMAGE, last: LAST } },
        { stageImages: images, objectInfo: withI2v },
      ).prompt;
      expectValidGraph(p);
      const [loadFirst] =
        byClass(p, "LoadImage").find(([, n]) => n.inputs.image === images[IMAGE.file]) ?? [];
      const [loadLast] =
        byClass(p, "LoadImage").find(([, n]) => n.inputs.image === images[LAST.file]) ?? [];
      const [videoId, video] = one(p, "WanFirstLastFrameToVideo");
      expect(video.inputs).toMatchObject({ start_image: [loadFirst, 0], end_image: [loadLast, 0] });
      expect(p["15"]?.inputs.latent_image).toEqual([videoId, 2]);
    });

    it("says which image to video file is missing", () => {
      expect(() => run("preset:wan22-14b", { source: { mode: "first", image: IMAGE } })).toThrow(
        `needs ${I2V.high} in your diffusion_models folder`,
      );
    });
  });
});

describe("continue a video (extend)", () => {
  const VIDEO = { ...IMAGE, file: "00112233aabbccdd.mp4", label: "so-far.mp4", duration: 3 };
  const uploaded = "blombo/00112233aabbccdd.mp4";
  const stageImages = { [VIDEO.file]: uploaded };
  const extend = { source: { mode: "extend", video: VIDEO } };
  const from = (v: unknown) => String((v as [string, number] | undefined)?.[0]);
  const withI2v = structuredClone(info);
  for (const [cls, input, names] of [
    [
      "UNETLoader",
      "unet_name",
      [
        "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors",
        "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors",
      ],
    ],
    [
      "LoraLoaderModelOnly",
      "lora_name",
      [
        "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors",
        "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors",
      ],
    ],
  ] as const) {
    const spec = withI2v[cls]?.input.required?.[input];
    if (spec && Array.isArray(spec[0])) spec[0] = [...(spec[0] as string[]), ...names];
  }

  /** The video's last frames, and the whole video put back together after decoding. */
  function expectStitched(p: ApiPrompt, decoded: string, maker: string, overlap: number) {
    const [loadId, loaded] = one(p, "LoadVideo");
    expect(loaded.inputs.file).toBe(uploaded);
    const [partsId] = one(p, "GetVideoComponents");
    expect(p[partsId]?.inputs.video).toEqual([loadId, 0]);
    const slices = byClass(p, "ImageFromBatch");
    const fromParts = slices.filter(([, n]) => from(n.inputs.image) === partsId);
    const tail = fromParts.find(([, n]) => n.inputs.length === overlap);
    const last = fromParts.find(([, n]) => n.inputs.length === 1);
    expect(tail?.[1].inputs).toMatchObject({ batch_index: -overlap, length: overlap });
    expect(last?.[1].inputs).toMatchObject({ batch_index: -1 });
    // The new frames' colors follow the old last frame.
    const [matchId, match] = one(p, "ColorTransfer");
    expect(match.inputs).toMatchObject({
      image_target: [decoded, 0],
      image_ref: [last?.[0], 0],
      source_stats: "uniform",
    });
    const fresh = slices.find(([, n]) => from(n.inputs.image) === matchId);
    expect(fresh?.[1].inputs).toMatchObject({ batch_index: overlap });
    const [joinedId, joined] = one(p, "BatchImagesNode");
    expect(joined.inputs["images.image1"]).toEqual([fresh?.[0], 0]);
    expect(p[maker]?.inputs.images).toEqual([joinedId, 0]);
    return { tail: tail?.[0] ?? "", partsId };
  }

  it("is offered on all four video workflows", () => {
    for (const name of ["wan22-5b", "ltx23", "minimax-h3"]) {
      const prompt = load(`preset:${name}`);
      expect(sourceModes(prompt, packages, analyze(prompt, info).bindings, "video")).toContain(
        "extend",
      );
    }
  });

  it("finds the sound going into the video and the VAE that decoded it", () => {
    expect(findPorts(load("preset:minimax-h3"))).toMatchObject({
      SOUND: ["13", 0],
      AUDIO_VAE: ["4", 0],
      IMAGE: ["12", 0],
    });
    expect(findPorts(load("preset:ltx23"))).toMatchObject({ SOUND: ["19", 0], IMAGE: ["18", 0] });
    expect(findPorts(load("preset:wan22-5b")).SOUND).toBeUndefined();
  });

  it("Wan 2.2: starts a new latent from the last 5 frames and puts the old ones in front", () => {
    const p = run("preset:wan22-5b", extend, { stageImages }).prompt;
    expectValidGraph(p);
    const { tail } = expectStitched(p, "9", "10", 5);
    const latent = p[from(p["8"]?.inputs.latent_image)];
    expect(latent?.class_type).toBe("Wan22ImageToVideoLatent");
    expect(latent?.inputs).toMatchObject({ start_image: [tail, 0], width: 1280, length: 49 });
  });

  it("Wan 2.2 14B: the image to video models, WanImageToVideo from the last frames", () => {
    const p = run("preset:wan22-14b", extend, { stageImages, objectInfo: withI2v }).prompt;
    expectValidGraph(p);
    const { tail } = expectStitched(p, "17", "18", 5);
    const [videoId, video] = one(p, "WanImageToVideo");
    expect(video.inputs.start_image).toEqual([tail, 0]);
    expect(p["15"]?.inputs.latent_image).toEqual([videoId, 2]);
    expect(p["1"]?.inputs.unet_name).toBe("wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors");
  });

  it("LTX: the last 9 frames into the latent, and the sound joined after the old sound", () => {
    const p = run("preset:ltx23", extend, { stageImages }).prompt;
    expectValidGraph(p);
    const { tail, partsId } = expectStitched(p, "18", "20", 9);
    const [, put] = one(p, "LTXVImgToVideoInplace");
    expect(from(put.inputs.image)).not.toBe(tail);
    const [trimId, trim] = one(p, "TrimAudioDuration");
    expect(trim.inputs).toMatchObject({ audio: ["19", 0], start_index: 0.36 });
    const [concatId, concat] = one(p, "AudioConcat");
    expect(concat.inputs).toMatchObject({ audio1: [partsId, 1], audio2: [trimId, 0] });
    expect(p["20"]?.inputs.audio).toEqual([concatId, 0]);
  });

  it("MiniMax H3: the last frames and their sound anchored at the start", () => {
    const p = run("preset:minimax-h3", extend, { stageImages }).prompt;
    expectValidGraph(p);
    const { tail, partsId } = expectStitched(p, "12", "14", 5);
    const [guideId, guide] = one(p, "MiniMaxH3AddGuide");
    const seconds = Math.round((5 / 24) * 10000) / 10000;
    expect(guide.inputs).toMatchObject({
      positive: ["6", 0],
      latent: ["6", 1],
      vae: ["3", 0],
      audio_vae: ["4", 0],
      image: [tail, 0],
      frame_idx: 0,
    });
    const tailSound = p[from(guide.inputs.audio)];
    expect(tailSound?.inputs).toMatchObject({
      audio: [partsId, 1],
      start_index: -seconds,
      duration: seconds,
    });
    expect(p["10"]?.inputs.conditioning).toEqual([guideId, 0]);
    expect(p["6"]?.inputs.first_frame).toBeUndefined();
  });

  it("stops without a video", () => {
    expect(() => run("preset:wan22-5b", { source: { mode: "extend" } })).toThrow(
      "Continue a video has no video",
    );
  });
});

describe("character swaps (SCAIL 2, MiniMax H3)", () => {
  const from = (v: unknown) => String((v as [string, number] | undefined)?.[0]);
  it("bind the character picture, the video and where in it a part starts", () => {
    const scail = analyze(load("preset:scail2-replace"), info).bindings;
    expect(scail.find((b) => b.role === "image.input")).toMatchObject({
      node: "14",
      type: "image",
    });
    expect(scail.find((b) => b.role === "video.input")).toMatchObject({
      node: "9",
      input: "file",
      type: "video",
    });
    expect(scail.find((b) => b.role === "video.offset")).toMatchObject({
      node: "11",
      input: "batch_index",
    });
    const h3 = analyze(load("preset:minimax-h3-swap"), info).bindings;
    expect(h3.find((b) => b.role === "video.input")).toMatchObject({ node: "7", type: "video" });
    expect(h3.find((b) => b.role === "prompt.positive")).toMatchObject({ node: "10" });
    // Both are sized from the video; H3's one-frame look at it isn't a start frame.
    expect(scail.find((b) => b.role === "video.megapixels")).toMatchObject({ node: "12" });
    expect(h3.find((b) => b.role === "video.megapixels")).toMatchObject({ node: "21" });
    expect(h3.find((b) => b.role === "video.offset")).toBeUndefined();
  });

  it("SCAIL keeps the video's shape, pads the character into it and turns Relight off at 0", () => {
    const p = load("preset:scail2-replace");
    expectValidGraph(p);
    // The frames are scaled to the megapixels with their shape kept, and that size runs.
    expect(p["12"]).toMatchObject({ class_type: "ImageScaleToTotalPixels" });
    expect(p["24"]?.inputs).toMatchObject({ width: ["13", 0], height: ["13", 1] });
    // The character is padded to that size (never cropped), for SAM and for SCAIL alike.
    expect(p["34"]).toMatchObject({
      class_type: "ResizeAndPadImage",
      inputs: { image: ["14", 0], target_width: ["13", 0], target_height: ["13", 1] },
    });
    expect(p["19"]?.inputs.images).toEqual(["34", 0]);
    expect(p["24"]?.inputs.reference_image).toEqual(["34", 0]);
    // Relight: the switch times the strength, so off loads no LoRA (ComfyUI skips strength 0).
    expect(p["3"]?.inputs.strength_model).toEqual(["37", 0]);
    expect(p["37"]?.inputs).toMatchObject({
      expression: "a * b",
      "values.a": ["35", 0],
      "values.b": ["36", 0],
    });
  });

  it("SCAIL continues from the video so far: its frames anchor, the driving video moves on", () => {
    const VIDEO = { ...IMAGE, file: "00112233aabbccdd.mp4", label: "so-far.mp4", duration: 3 };
    const prompt = load("preset:scail2-replace");
    expect(sourceModes(prompt, packages, analyze(prompt, info).bindings, "video")).toEqual([
      "txt2img",
      "extend",
    ]);
    const p = run(
      "preset:scail2-replace",
      { source: { mode: "extend", video: VIDEO } },
      { stageImages: { [VIDEO.file]: "blombo/00112233aabbccdd.mp4" } },
    ).prompt;
    expectValidGraph(p);
    const [loadId] =
      byClass(p, "LoadVideo").find(([, n]) => n.inputs.file === "blombo/00112233aabbccdd.mp4") ??
      [];
    const [partsId] =
      byClass(p, "GetVideoComponents").find(([, n]) => from(n.inputs.video) === loadId) ?? [];
    expect(p["24"]?.inputs.previous_frames).toEqual([partsId, 0]);
    // The driving video's slice starts 5 frames before the end of the video so far.
    const [mathId, math] =
      byClass(p, "ComfyMathExpression").find(([, n]) => n.inputs.expression === "a - 5") ?? [];
    expect(math?.inputs.expression).toBe("a - 5");
    expect(p["11"]?.inputs.batch_index).toEqual([mathId, 1]);
    const [joinedId, joined] = one(p, "BatchImagesNode");
    expect(joined.inputs["images.image0"]).toEqual([partsId, 0]);
    expect(p["29"]?.inputs.images).toEqual([joinedId, 0]);
  });
});

describe("smooth motion (frame interpolation)", () => {
  it("draws frames between the decoded frames and raises the frame rate by as much", () => {
    const p = run("preset:wan22-14b", {
      smooth: { enabled: true, model: "film_net_fp16.safetensors", multiplier: 3 },
    }).prompt;
    expectValidGraph(p);
    const [loaderId, loader] = one(p, "FrameInterpolationModelLoader");
    expect(loader.inputs.model_name).toBe("film_net_fp16.safetensors");
    const [interpId, interp] = one(p, "FrameInterpolate");
    expect(interp.inputs).toMatchObject({
      interp_model: [loaderId, 0],
      images: ["17", 0],
      multiplier: 3,
    });
    expect(p["18"]?.inputs).toMatchObject({ images: [interpId, 0], fps: 48 });
    // A frame rate setting is set directly: no math nodes.
    expect(byClass(p, "ComfyMathExpression")).toEqual([]);
  });

  it("multiplies a frame rate that comes from the input video (SCAIL swap)", () => {
    const p = run("preset:scail2-replace", { smooth: { enabled: true, multiplier: 3 } }).prompt;
    expectValidGraph(p);
    const [interpId] = one(p, "FrameInterpolate");
    const [rateId, rate] =
      byClass(p, "ComfyMathExpression").find(([, n]) => n._meta?.title?.startsWith("Smooth")) ?? [];
    const [multId] =
      byClass(p, "PrimitiveInt").find(([, n]) => n._meta?.title?.startsWith("Smooth")) ?? [];
    expect(rate?.inputs).toMatchObject({
      expression: "a * b",
      "values.a": ["10", 2],
      "values.b": [multId, 0],
    });
    expect(multId && p[multId]?.inputs.value).toBe(3);
    expect(p["29"]?.inputs).toMatchObject({ images: [interpId, 0], fps: [rateId, 0] });
  });

  it("is off by default and says so on a workflow without a frame rate", () => {
    expect(byClass(run("preset:wan22-14b", {}).prompt, "FrameInterpolate")).toEqual([]);
    expect(() => run("sd15-api", { smooth: { enabled: true } })).toThrow(
      "Smooth motion needs the workflow's frame rate, and this workflow has none.",
    );
  });
});

describe("hires fix", () => {
  it("upscales the decoded image, samples it again and saves the result", () => {
    const out = run("sd15-api", {
      hires: { enabled: true, scale: 2, upscaler: "4x-UltraSharp.pth", denoise: 0.4 },
    });
    const p = out.prompt;
    expectValidGraph(p);
    const [loaderId] = one(p, "UpscaleModelLoader");
    const [upId, up] = one(p, "ImageUpscaleWithModel");
    expect(up.inputs).toMatchObject({ upscale_model: [loaderId, 0], image: ["8", 0] });
    const [, resize] = one(p, "ImageScale");
    expect(resize.inputs).toMatchObject({ image: [upId, 0], width: 1024, height: 1536 });
    const samplers = byClass(p, "KSampler");
    expect(samplers).toHaveLength(2);
    const [hiresId, hires] = samplers.find(([id]) => id !== "3") as [string, ApiPrompt[string]];
    // Steps, CFG, sampler and scheduler follow the base until unlinked.
    expect(hires.inputs).toMatchObject({
      seed: 42,
      steps: 25,
      scheduler: "karras",
      cfg: p["3"]?.inputs.cfg,
      sampler_name: p["3"]?.inputs.sampler_name,
      denoise: 0.4,
      positive: ["6", 0],
      negative: ["7", 0],
    });
    const [decodeId] = byClass(p, "VAEDecode").find(([, n]) => {
      const s = n.inputs.samples;
      return isApiLink(s) && String(s[0]) === hiresId;
    }) as [string, unknown];
    expect(p["9"]?.inputs.images).toEqual([decodeId, 0]);
    expect(out.segments.map((s) => s.label)).toEqual(["Sampling", "Hires fix"]);
    expect(out.segments[1]?.nodes).toEqual([hiresId]);
  });

  it("resizes without a model, follows unlinked fields and saves the first pass when asked", () => {
    const out = run("sd15-api", {
      hires: {
        enabled: true,
        sizeMode: "target",
        width: 1001,
        height: 1500,
        upscaler: "",
        saveFirst: true,
        unlinked: ["cfg", "prompt"],
        cfg: 3.5,
        prompt: "sharp details <lora:face_fix:0.6>",
      },
    });
    const p = out.prompt;
    expectValidGraph(p);
    expect(byClass(p, "UpscaleModelLoader")).toHaveLength(0);
    const [, resize] = one(p, "ImageScale");
    expect(resize.inputs).toMatchObject({ image: ["8", 0], width: 1000, height: 1504 });
    const hires = byClass(p, "KSampler").find(([id]) => id !== "3")?.[1];
    expect(hires?.inputs.cfg).toBe(3.5);
    const posLink = hires?.inputs.positive;
    expect(isApiLink(posLink)).toBe(true);
    const pos = p[String((posLink as [string, number])[0])];
    expect(pos?.inputs.text).toBe("sharp details");
    // The stage prompt's LoRA applies to the stage only.
    const [loraId, lora] = one(p, "LoraLoader");
    expect(lora.inputs).toMatchObject({ lora_name: "face_fix.safetensors", strength_model: 0.6 });
    expect(hires?.inputs.model).toEqual([loraId, 0]);
    expect(p["3"]?.inputs.model).toEqual(["4", 0]);
    expect(out.texts["hires.prompt"]).toBe("sharp details");
    const saves = byClass(p, "SaveImage");
    expect(saves).toHaveLength(2);
    expect(saves.find(([id]) => id !== "9")?.[1].inputs).toMatchObject({
      images: ["8", 0],
      filename_prefix: "day/wf-first",
    });
  });

  it("uses SamplerCustomAdvanced on diffusion graphs", () => {
    const out = run("flux-unet-api", { hires: { enabled: true, scale: 1.5 } });
    const p = out.prompt;
    expectValidGraph(p);
    expect(byClass(p, "SamplerCustomAdvanced")).toHaveLength(2);
    const guiders = byClass(p, "BasicGuider");
    const stageGuider = guiders.find(([id]) => id !== "6")?.[1];
    expect(stageGuider?.inputs).toMatchObject({ model: ["1", 0], conditioning: ["5", 0] });
    const sched = byClass(p, "BasicScheduler").find(([id]) => id !== "9")?.[1];
    expect(sched?.inputs).toMatchObject({ steps: 20, scheduler: "simple", denoise: 0.35 });
    expect(one(p, "ImageScale")[1].inputs).toMatchObject({ width: 1536, height: 1536 });
    expect(out.segments.map((s) => s.id)).toEqual(["base", "hires"]);
  });
});

describe("adetailer", () => {
  const units = [
    { id: "face", name: "Face", detector: "bbox/face_yolov8m.pt", sam: "sam_vit_b_01ec64.pth" },
    {
      id: "hands",
      name: "Hands",
      detector: "segm/person_yolov8m-seg.pt",
      unlinked: ["prompt", "steps"],
      prompt: "detailed hands",
      steps: 12,
    },
  ];

  it("chains one detailer per unit after the image, with the base prompt", () => {
    const out = run("sd15-api", { adetailer: { enabled: true, units } });
    const p = out.prompt;
    expectValidGraph(p);
    const detailers = byClass(p, "FaceDetailer");
    expect(detailers).toHaveLength(2);
    const [faceId, face] = detailers[0] as [string, ApiPrompt[string]];
    const [handsId, hands] = detailers[1] as [string, ApiPrompt[string]];
    expect(face.inputs).toMatchObject({
      image: ["8", 0],
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      steps: p["3"]?.inputs.steps,
      seed: 42,
    });
    expect(isApiLink(face.inputs.sam_model_opt)).toBe(true);
    expect(face.inputs.segm_detector_opt).toBeUndefined();
    expect(hands.inputs.image).toEqual([faceId, 0]);
    expect(hands.inputs.steps).toBe(12);
    expect(hands.inputs.sam_model_opt).toBeUndefined();
    expect(isApiLink(hands.inputs.segm_detector_opt)).toBe(true);
    expect(byClass(p, "SAMLoader")).toHaveLength(1);
    expect(p["9"]?.inputs.images).toEqual([handsId, 0]);
    expect(out.segments.map((s) => s.label)).toEqual([
      "Sampling",
      "ADetailer · Face",
      "ADetailer · Hands",
    ]);
  });

  it("runs after Hires fix and skips units that are off", () => {
    const out = run("sd15-api", {
      hires: { enabled: true },
      adetailer: { enabled: true, units: [units[0], { ...units[1], enabled: false }] },
    });
    const p = out.prompt;
    expectValidGraph(p);
    const [, detailer] = one(p, "FaceDetailer");
    const img = detailer.inputs.image as [string, number];
    expect(p[img[0]]?.class_type).toBe("VAEDecode");
    expect(img[0]).not.toBe("8");
    expect(out.segments.map((s) => s.id)).toEqual(["base", "hires", "adetailer-face"]);
  });

  it("uses an empty negative and CFG 1 on diffusion graphs", () => {
    const out = run("flux-unet-api", { adetailer: { enabled: true, units: [units[0]] } });
    const p = out.prompt;
    expectValidGraph(p);
    const [zeroId, zero] = one(p, "ConditioningZeroOut");
    expect(zero.inputs.conditioning).toEqual(["5", 0]);
    const [, detailer] = one(p, "FaceDetailer");
    expect(detailer.inputs).toMatchObject({
      negative: [zeroId, 0],
      cfg: 1,
      scheduler: "simple",
      clip: ["2", 0],
      vae: ["3", 0],
    });
  });
});

describe("controlnet", () => {
  const unit = {
    id: "pose",
    name: "Pose",
    image: IMAGE,
    preprocessor: "DWPreprocessor",
    model: "controlnet-openpose-sdxl.safetensors",
    strength: 0.8,
    end: 0.7,
  };

  it("applies to the conditioning before the main sampler", () => {
    const out = run("sd15-api", { controlnet: { enabled: true, units: [unit] } });
    const p = out.prompt;
    expectValidGraph(p);
    const [imgId, img] = one(p, "LoadImage");
    expect(img.inputs.image).toBe("blombo/0123456789abcdef.png");
    const [preId, pre] = one(p, "AIO_Preprocessor");
    expect(pre.inputs).toMatchObject({
      image: [imgId, 0],
      preprocessor: "DWPreprocessor",
      resolution: 1024,
    });
    const [applyId, apply] = one(p, "ControlNetApplyAdvanced");
    expect(apply.inputs).toMatchObject({
      positive: ["6", 0],
      negative: ["7", 0],
      image: [preId, 0],
      strength: 0.8,
      start_percent: 0,
      end_percent: 0.7,
    });
    expect(p["3"]?.inputs).toMatchObject({ positive: [applyId, 0], negative: [applyId, 1] });
    // ControlNet doesn't sample: no extra segment.
    expect(out.segments.map((s) => s.id)).toEqual(["base"]);
  });

  it("chains units, skips the preprocessor for ready maps and feeds Hires but not ADetailer", () => {
    const out = run("sd15-api", {
      controlnet: {
        enabled: true,
        units: [unit, { ...unit, id: "edges", name: "Edges", preprocessor: "none" }],
      },
      hires: { enabled: true },
      adetailer: {
        enabled: true,
        units: [{ id: "face", name: "Face", detector: "bbox/face_yolov8m.pt" }],
      },
    });
    const p = out.prompt;
    expectValidGraph(p);
    expect(byClass(p, "AIO_Preprocessor")).toHaveLength(1);
    const applies = byClass(p, "ControlNetApplyAdvanced");
    expect(applies).toHaveLength(2);
    const [firstId] = applies[0] as [string, unknown];
    const [secondId, second] = applies[1] as [string, ApiPrompt[string]];
    expect(second.inputs.positive).toEqual([firstId, 0]);
    expect(p["3"]?.inputs.positive).toEqual([secondId, 0]);
    const hires = byClass(p, "KSampler").find(([id]) => id !== "3")?.[1];
    expect(hires?.inputs.positive).toEqual([secondId, 0]);
    const [, detailer] = one(p, "FaceDetailer");
    expect(detailer.inputs.positive).toEqual(["6", 0]);
  });

  it("works on diffusion graphs without a negative prompt", () => {
    const out = run("flux-unet-api", { controlnet: { enabled: true, units: [unit] } });
    const p = out.prompt;
    expectValidGraph(p);
    const [applyId, apply] = one(p, "ControlNetApplyAdvanced");
    expect(apply.inputs.positive).toEqual(["5", 0]);
    expect(p["6"]?.inputs.conditioning).toEqual([applyId, 0]);
  });
});

describe("problems", () => {
  const status = (name: string, stages: unknown, objectInfo: ObjectInfo | null = info) => {
    const s = setup(name, stages);
    const prompt = structuredClone(s.prompt);
    return (only: "hires" | "adetailer" | "controlnet") =>
      applyStages(
        prompt,
        s.stages as StageSettings,
        packages,
        {
          bindings: s.manifest.bindings,
          values: s.values,
          seed: 1,
          wildcards: null,
          random: Math.random,
          loraFiles: "skip",
          images: null,
          filenamePrefix: "x",
          info: objectInfo,
        },
        only,
      ).statuses[0];
  };

  it("name the missing custom nodes and their packs", () => {
    const withoutImpact = Object.fromEntries(
      Object.entries(info).filter(
        ([k]) => !["FaceDetailer", "UltralyticsDetectorProvider"].includes(k),
      ),
    );
    const s = status("sd15-api", {}, withoutImpact)("adetailer");
    const nodes = s?.problems.find((p) => p.code === "missing_nodes");
    expect(nodes?.message).toBe(
      "ADetailer needs FaceDetailer (ComfyUI Impact Pack) and UltralyticsDetectorProvider (ComfyUI Impact Subpack). Install the missing custom nodes in ComfyUI (Manager → Custom Nodes Manager), then restart ComfyUI.",
    );
    expect(nodes?.packs?.map((p) => p.url)).toEqual([
      "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
      "https://github.com/ltdrdata/ComfyUI-Impact-Subpack",
    ]);
  });

  it("ask for models that aren't picked or aren't there, and list the choices", () => {
    const s = status("sd15-api", {
      adetailer: { units: [{ id: "face", name: "Face", detector: "", sam: "gone.pth" }] },
    })("adetailer");
    expect(s?.problems.map((p) => p.code)).toEqual(["pick_model", "missing_model"]);
    expect(s?.problems[0]?.message).toBe("ADetailer · Face: pick a detector.");
    expect(s?.problems[1]?.modelKind).toBe("sams");
    expect(s?.choices.detector).toContain("bbox/face_yolov8m.pt");
    const cn = status("sd15-api", {})("controlnet");
    expect(cn?.choices.preprocessor).toContain("DWPreprocessor");
    expect(cn?.problems.map((p) => p.code)).toEqual(["no_image", "pick_model"]);
  });

  it("don't need controlnet_aux for a ready map", () => {
    const noAux = Object.fromEntries(
      Object.entries(info).filter(([k]) => k !== "AIO_Preprocessor"),
    );
    const ready = status(
      "sd15-api",
      {
        controlnet: {
          units: [{ id: "u", name: "U", image: IMAGE, model: "control_v11p_sd15_canny.pth" }],
        },
      },
      noAux,
    )("controlnet");
    expect(ready?.problems).toEqual([]);
    const withPre = status(
      "sd15-api",
      {
        controlnet: {
          units: [
            {
              id: "u",
              name: "U",
              image: IMAGE,
              preprocessor: "CannyEdgePreprocessor",
              model: "control_v11p_sd15_canny.pth",
            },
          ],
        },
      },
      noAux,
    )("controlnet");
    expect(withPre?.problems[0]?.code).toBe("missing_nodes");
  });

  it("stop the run with the same message", () => {
    expect(() =>
      run("sd15-api", { adetailer: { enabled: true, units: [{ id: "f", name: "Face" }] } }),
    ).toThrow(CompileError);
    expect(() =>
      run("sd15-api", { adetailer: { enabled: true, units: [{ id: "f", name: "Face" }] } }),
    ).toThrow("ADetailer · Face: pick a detector.");
  });

  it("report a missing port", () => {
    const s = status("flux-unet-api", {})("hires");
    expect(s?.package).toBe("hires-diffusion");
    expect(s?.problems).toEqual([]);
    // A graph with no decoder has no IMAGE port.
    const bare = load("sd15-api");
    delete bare["8"];
    delete bare["9"];
    const a = analyze(bare, info);
    const r = applyStages(
      bare,
      readStages({}),
      packages,
      {
        bindings: a.bindings,
        values: a.values,
        seed: 1,
        wildcards: null,
        random: Math.random,
        loraFiles: "skip",
        images: null,
        filenamePrefix: "x",
        info,
      },
      "hires",
    );
    expect(r.statuses[0]?.problems[0]?.message).toBe(
      "Hires fix can't attach to this workflow: it has no VAE and decoded image.",
    );
  });
});
