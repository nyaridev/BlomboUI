import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiPrompt, ObjectInfo, UiGraph } from "../../../shared/workflow/graph.ts";
import { apiToUi, applyWidgetValues, uiToApi } from "./convert.ts";

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
      // Every value comes back; optional inputs the API graph left out get their defaults.
      expect(Object.keys(back.prompt)).toEqual(Object.keys(api));
      expect(strip(back.prompt)).toMatchObject(strip(api));
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

  it("writes a value fed by a primitive into the primitive", () => {
    const edited = UiGraph.parse(
      applyWidgetValues(graph, [{ node: "3", input: "seed", value: 4242 }], info),
    );
    expect(uiToApi(edited, info).prompt["3"]?.inputs.seed).toBe(4242);
    // The KSampler's own (hidden) seed widget is left as it was.
    const own = edited.nodes.find((n) => n.id === 3)?.widgets_values as unknown[] | undefined;
    expect(own?.[0]).toBe(0);
  });

  it("reports unknown nodes instead of guessing", () => {
    const g = UiGraph.parse({ nodes: [{ id: 1, type: "MysteryNode" }], links: [] });
    const { prompt, findings } = uiToApi(g, info);
    expect(prompt).toEqual({});
    expect(findings.map((f) => f.code)).toEqual(["missing_node"]);
  });

  it("fills defaults for inputs a save has no value for", () => {
    const g = UiGraph.parse({
      nodes: [{ id: 1, type: "KSampler", widgets_values: [5, "fixed", 20] }],
      links: [],
    });
    expect(uiToApi(g, info).prompt["1"]?.inputs).toMatchObject({ seed: 5, steps: 20, cfg: 8 });
  });
});

describe("applyWidgetValues", () => {
  it("writes values into the widgets uiToApi reads them from", () => {
    const prompt = ApiPrompt.parse(
      JSON.parse(fs.readFileSync(path.join(dir, "sd15-api.json"), "utf8")),
    );
    const ui = apiToUi(prompt, info);
    const edited = applyWidgetValues(
      ui,
      [
        { node: "3", input: "steps", value: 41 },
        { node: "3", input: "cfg", value: 4.5 },
        { node: "6", input: "text", value: "a red barn" },
        { node: "99", input: "steps", value: 1 },
      ],
      info,
    );
    const back = uiToApi(UiGraph.parse(edited), info).prompt;
    expect(back["3"]?.inputs).toMatchObject({
      steps: 41,
      cfg: 4.5,
      seed: prompt["3"]?.inputs.seed,
    });
    expect(back["6"]?.inputs.text).toBe("a red barn");
    // The original is left as it was.
    expect(uiToApi(UiGraph.parse(ui), info).prompt["3"]?.inputs.steps).toBe(
      prompt["3"]?.inputs.steps,
    );
  });
});

/* ── subgraphs ────────────────────────────────────────────────────────────── */

const sub = path.join(dir, "subgraphs");
const readSub = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(sub, `${name}.json`), "utf8"));
/** ComfyUI 0.44's object_info, the classes the templates use. */
const real = ObjectInfo.parse(readSub("object_info"));
const template = (name: string) => UiGraph.parse(readSub(name));
/** A node's widgets_values in a UI graph, inside subgraph definitions too. */
const widgetsOf = (graph: unknown, id: number, def?: string): unknown[] => {
  const g = graph as {
    nodes: UiGraph["nodes"];
    definitions: { subgraphs: Array<{ id: string; nodes: UiGraph["nodes"] }> };
  };
  const nodes = def ? g.definitions.subgraphs.find((s) => s.id === def)?.nodes : g.nodes;
  return (nodes?.find((n) => n.id === id)?.widgets_values ?? []) as unknown[];
};

describe("uiToApi: subgraphs", () => {
  // ComfyUI's own templates. The .api.json files are what its frontend (1.57.6) runs for them
  // (app.graphToPrompt(), compared node by node).
  for (const name of ["z-image-turbo", "flux2-klein", "krea2-turbo"])
    it(`flattens the ${name} template the way ComfyUI does`, () => {
      const { prompt, findings } = uiToApi(template(name), real);
      expect(findings).toEqual([]);
      expect(strip(prompt)).toEqual(readSub(`${name}.api`));
    });

  it("leaves out a bypassed instance and the nodes inside it", () => {
    const { prompt } = uiToApi(template("flux2-klein"), real);
    expect(Object.keys(prompt).filter((id) => id.startsWith("77") || id === "78")).toEqual([]);
    expect(prompt["9"]?.inputs.images).toEqual(["75:65", 0]);
  });

  it("flattens nested subgraphs, with the instance's values over the inner ones", () => {
    const { prompt, findings } = uiToApi(UiGraph.parse(readSub("nested")), info);
    expect(findings).toEqual([]);
    // The muted instance 13, the bypassed 22 and the muted 23 don't run.
    expect(Object.keys(prompt).sort()).toEqual(
      ["1", "10:20", "10:21", "10:30:40", "10:30:41", "11", "9"].sort(),
    );
    expect(prompt["10:30:41"]?.inputs).toEqual({
      model: ["1", 0],
      seed: 1234,
      steps: 30,
      cfg: 6,
      sampler_name: "euler",
      scheduler: "normal",
      positive: ["10:20", 0],
      negative: ["10:21", 0],
      latent_image: ["10:30:40", 0],
      denoise: 1,
    });
    expect(prompt["10:20"]?.inputs).toEqual({ text: "a lighthouse", clip: ["1", 1] });
    expect(prompt["10:20"]?._meta?.title).toBe("Positive");
    expect(prompt["9"]?.inputs.samples).toEqual(["10:30:41", 0]);
  });

  it("refuses a subgraph that contains itself", () => {
    const g = UiGraph.parse({
      nodes: [{ id: 5, type: "loop", title: "Loop" }],
      links: [],
      definitions: { subgraphs: [{ id: "loop", nodes: [{ id: 1, type: "loop" }] }] },
    });
    const { prompt, findings } = uiToApi(g, info);
    expect(prompt).toEqual({});
    expect(findings.map((f) => [f.code, f.node])).toEqual([["subgraph", "5:1"]]);
  });
});

describe("applyWidgetValues: subgraphs", () => {
  it("writes inner values where a template keeps them", () => {
    const g = template("z-image-turbo");
    const edited = applyWidgetValues(
      g,
      [
        { node: "57:27", input: "text", value: "a red fox" },
        { node: "57:3", input: "steps", value: 6 },
      ],
      real,
    );
    const back = uiToApi(UiGraph.parse(edited), real).prompt;
    expect(back["57:27"]?.inputs.text).toBe("a red fox");
    expect(back["57:3"]?.inputs.steps).toBe(6);
    expect(uiToApi(g, real).prompt["57:3"]?.inputs.steps).toBe(8);
  });

  it("writes into the instance when it keeps the value (older saves)", () => {
    const edited = applyWidgetValues(
      template("krea2-turbo"),
      [
        { node: "30:3", input: "seed", value: 42 },
        { node: "30:19", input: "value", value: "a red fox" },
      ],
      real,
    );
    const krea = "b0e5ca93-2731-42b9-8e0a-d28ea851ff81";
    expect(widgetsOf(edited, 30).slice(0, 7)).toEqual([
      "a red fox",
      true,
      false,
      512,
      1024,
      1024,
      42,
    ]);
    expect(widgetsOf(edited, 3, krea)[0]).toBe(735915477938686);
    const back = uiToApi(UiGraph.parse(edited), real).prompt;
    expect(back["30:3"]?.inputs.seed).toBe(42);
    expect(back["30:19"]?.inputs.value).toBe("a red fox");
  });

  it("follows nested subgraphs to the primitive or instance that holds a value", () => {
    const edited = applyWidgetValues(
      readSub("nested"),
      [
        { node: "10:30:41", input: "seed", value: 99 },
        { node: "10:30:41", input: "steps", value: 12 },
        { node: "10:30:41", input: "cfg", value: 4.5 },
        { node: "10:20", input: "text", value: "a barn" },
      ],
      info,
    );
    expect(widgetsOf(edited, 2)[0]).toBe(99);
    expect(widgetsOf(edited, 10)).toEqual([0, "a barn", 12]);
    expect(widgetsOf(edited, 41, "sg-inner")[3]).toBe(4.5);
    expect(uiToApi(UiGraph.parse(edited), info).prompt["10:30:41"]?.inputs).toMatchObject({
      seed: 99,
      steps: 12,
      cfg: 4.5,
    });
  });
});
