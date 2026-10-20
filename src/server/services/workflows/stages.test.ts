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
import { applyStages, type LoadedStage } from "./stages.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "fixtures");
const presetsDir = path.join(here, "..", "..", "..", "..", "presets");
const load = (name: string) =>
  ApiPromptSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")));
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
