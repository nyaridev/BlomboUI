import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiPrompt, ObjectInfo, UiGraph } from "../../../shared/workflow/graph.ts";
import { apiToUi, uiToApi } from "./convert.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) =>
  ApiPrompt.parse(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")));
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(dir, "object_info.json"), "utf8")),
);

const strip = (p: ApiPrompt) =>
  Object.fromEntries(
    Object.entries(p).map(([id, n]) => [id, { class_type: n.class_type, inputs: n.inputs }]),
  );

describe("apiToUi → uiToApi", () => {
  for (const name of ["sd15-api", "sdxl-api", "flux-unet-api", "dollar-titles-api"]) {
    it(`round-trips ${name}`, () => {
      const api = load(name);
      const ui = UiGraph.parse(apiToUi(api, info));
      const back = uiToApi(ui, info);
      expect(back.findings).toEqual([]);
      expect(strip(back.prompt)).toEqual(strip(api));
      // Custom titles survive.
      for (const [id, node] of Object.entries(api))
        if (node._meta?.title) expect(back.prompt[id]?._meta?.title).toBe(node._meta.title);
    });
  }

  it("lays nodes out left to right by dependency", () => {
    const ui = apiToUi(load("sd15-api"), info) as {
      nodes: Array<{ id: number; pos: [number, number] }>;
    };
    const x = (id: number) => ui.nodes.find((n) => n.id === id)?.pos[0] ?? -1;
    expect(x(4)).toBeLessThan(x(6));
    expect(x(6)).toBeLessThan(x(3));
    expect(x(3)).toBeLessThan(x(9));
  });
});

describe("uiToApi", () => {
  // Checkpoint → Reroute → (bypassed) ModelSamplingDiscrete → KSampler, seed from a primitive.
  const graph = UiGraph.parse({
    nodes: [
      {
        id: 1,
        type: "CheckpointLoaderSimple",
        widgets_values: ["sd15/dreamshaper_8.safetensors"],
        outputs: [
          { name: "MODEL", type: "MODEL", links: [1] },
          { name: "CLIP", type: "CLIP", links: [5, 6] },
          { name: "VAE", type: "VAE", links: [9] },
        ],
      },
      {
        id: 10,
        type: "Reroute",
        inputs: [{ name: "", type: "*", link: 1 }],
        outputs: [{ name: "", type: "MODEL", links: [2] }],
      },
      {
        id: 12,
        type: "ModelSamplingDiscrete",
        mode: 4,
        inputs: [{ name: "model", type: "MODEL", link: 2 }],
        outputs: [{ name: "MODEL", type: "MODEL", links: [3] }],
        widgets_values: ["eps", false],
      },
      {
        id: 11,
        type: "PrimitiveNode",
        outputs: [{ name: "INT", type: "INT", links: [4] }],
        widgets_values: [777, "fixed"],
      },
      {
        id: 6,
        type: "CLIPTextEncode",
        inputs: [{ name: "clip", type: "CLIP", link: 5 }],
        widgets_values: ["a lighthouse"],
      },
      {
        id: 7,
        type: "CLIPTextEncode",
        inputs: [{ name: "clip", type: "CLIP", link: 6 }],
        widgets_values: [""],
      },
      {
        id: 5,
        type: "EmptyLatentImage",
        widgets_values: [512, 512, 1],
        outputs: [{ name: "LATENT", type: "LATENT", links: [7] }],
      },
      {
        id: 3,
        type: "KSampler",
        inputs: [
          { name: "model", type: "MODEL", link: 3 },
          { name: "positive", type: "CONDITIONING", link: 10 },
          { name: "negative", type: "CONDITIONING", link: 11 },
          { name: "latent_image", type: "LATENT", link: 7 },
          { name: "seed", type: "INT", link: 4, widget: { name: "seed" } },
        ],
        widgets_values: [0, "randomize", 20, 6.5, "euler", "normal", 1],
      },
      {
        id: 8,
        type: "VAEDecode",
        inputs: [
          { name: "samples", type: "LATENT", link: 12 },
          { name: "vae", type: "VAE", link: 9 },
        ],
      },
      {
        id: 9,
        type: "SaveImage",
        inputs: [{ name: "images", type: "IMAGE", link: 13 }],
        widgets_values: ["ComfyUI"],
      },
      { id: 20, type: "Note", widgets_values: ["hello"] },
    ],
    links: [
      [1, 1, 0, 10, 0, "MODEL"],
      [2, 10, 0, 12, 0, "MODEL"],
      [3, 12, 0, 3, 0, "MODEL"],
      [4, 11, 0, 3, 4, "INT"],
      [5, 1, 1, 6, 0, "CLIP"],
      [6, 1, 1, 7, 0, "CLIP"],
      [7, 5, 0, 3, 3, "LATENT"],
      [9, 1, 2, 8, 1, "VAE"],
      [10, 6, 0, 3, 1, "CONDITIONING"],
      [11, 7, 0, 3, 2, "CONDITIONING"],
      [12, 3, 0, 8, 0, "LATENT"],
      [13, 8, 0, 9, 0, "IMAGE"],
    ],
  });

  it("resolves reroutes, primitives and bypassed nodes", () => {
    const { prompt, findings } = uiToApi(graph, info);
    expect(findings).toEqual([]);
    expect(Object.keys(prompt).sort()).toEqual(["1", "3", "5", "6", "7", "8", "9"]);
    expect(prompt["3"]?.inputs).toEqual({
      model: ["1", 0],
      seed: 777,
      steps: 20,
      cfg: 6.5,
      sampler_name: "euler",
      scheduler: "normal",
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: ["5", 0],
      denoise: 1,
    });
    expect(prompt["6"]?.inputs).toEqual({ text: "a lighthouse", clip: ["1", 1] });
  });

  it("reports unknown nodes and subgraphs instead of guessing", () => {
    const g = UiGraph.parse({
      nodes: [
        { id: 1, type: "MysteryNode" },
        { id: 2, type: "a1b2c3d4-subgraph", title: "Upscale group" },
      ],
      links: [],
      definitions: { subgraphs: [{ id: "a1b2c3d4-subgraph" }] },
    });
    const { prompt, findings } = uiToApi(g, info);
    expect(prompt).toEqual({});
    expect(findings.map((f) => f.code).sort()).toEqual(["missing_node", "subgraph"]);
  });
});
