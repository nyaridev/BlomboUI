import { describe, expect, it } from "vitest";
import type { ApiPrompt, ObjectInfo } from "../../../shared/workflow/graph.ts";
import { parseNodeMap } from "../nodemap.ts";
import { checkHealth, type HealthInput } from "./health.ts";

const info = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [["have.safetensors"]] } },
    output: ["MODEL"],
  },
  UpscaleModelLoader: {
    input: { required: { model_name: ["COMBO", { options: ["4x.pth"] }] } },
    output: ["UPSCALE_MODEL"],
  },
  KSampler: { input: { required: { sampler_name: [["euler", "dpmpp_2m"]] } }, output: [] },
} as unknown as ObjectInfo;

const SHA = "a".repeat(40);
const nodeMap = parseNodeMap({
  "https://github.com/m/mapped.git": [["MappedNode"], { title_aux: "Mapped pack" }],
  "https://github.com/m/patterned": [[], { nodename_pattern: " \\(pat\\)$" }],
  "https://gitlab.com/x/y": [["GitlabNode"], {}],
});

const base = (prompt: ApiPrompt, graph: unknown = null): HealthInput => ({
  prompt,
  graph,
  info,
  known: [{ name: "Pinned", url: "https://github.com/b/pinned", nodes: ["PinnedNode"], ref: SHA }],
  nodeMap,
  catalog: [
    { id: "e1", filename: "cat.safetensors", kind: "checkpoints", size: 100, host: "hf.co" },
  ],
  linkAllowed: (u) => u.host === "huggingface.co",
});

describe("checkHealth", () => {
  it("finds each missing class's pack: Blombo's, the workflow's, the Manager's, else unknown", () => {
    const prompt: ApiPrompt = {
      "1": { class_type: "PinnedNode", inputs: {} },
      "2": { class_type: "SavedNode", inputs: {} },
      "3": { class_type: "MappedNode", inputs: {} },
      "4": { class_type: "Thing (pat)", inputs: {} },
      "5": { class_type: "GitlabNode", inputs: {} },
      "6": { class_type: "KSampler", inputs: { sampler_name: "euler" } },
    };
    const graph = {
      nodes: [
        { id: 2, type: "SavedNode", properties: { aux_id: "w/saved", ver: SHA } },
        { id: 7, type: "Mystery", properties: {} },
        // Muted and frontend-only nodes need nothing.
        { id: 8, type: "MutedNode", mode: 2 },
        { id: 9, type: "Note" },
      ],
    };
    const h = checkHealth(base(prompt, graph));
    expect(h.checked).toBe(true);
    expect(h.packs.map((p) => [p.source, p.url, p.ref ?? null, p.nodes])).toEqual([
      ["manager", "https://github.com/m/mapped", null, ["MappedNode"]],
      ["blombo", "https://github.com/b/pinned", SHA, ["PinnedNode"]],
      ["workflow", "https://github.com/w/saved", SHA, ["SavedNode"]],
      ["manager", "https://github.com/m/patterned", null, ["Thing (pat)"]],
    ]);
    expect(h.packs[0]?.name).toBe("Mapped pack");
    // Only GitHub repositories can be installed.
    expect(h.unknownNodes).toEqual(["GitlabNode", "Mystery"]);
  });

  it("lists missing models with the catalog's file or the workflow's Hugging Face link", () => {
    const prompt: ApiPrompt = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "have.safetensors" } },
      "2": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "SDXL\\cat.safetensors" } },
      "3": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "cat.safetensors" } },
      "4": { class_type: "UpscaleModelLoader", inputs: { model_name: "linked.pth" } },
      "5": { class_type: "UpscaleModelLoader", inputs: { model_name: "evil.pth" } },
      "6": { class_type: "KSampler", inputs: { sampler_name: "gone_sampler" } },
    };
    const graph = {
      nodes: [
        {
          id: 4,
          type: "UpscaleModelLoader",
          properties: {
            models: [
              {
                name: "linked.pth",
                url: "https://huggingface.co/o/r/resolve/main/linked.pth",
                directory: "upscale_models",
              },
              {
                name: "evil.pth",
                url: "https://evil.example/evil.pth",
                directory: "upscale_models",
              },
            ],
          },
        },
      ],
    };
    const h = checkHealth(base(prompt, graph));
    expect(h.packs).toEqual([]);
    expect(h.models).toEqual([
      {
        file: "SDXL\\cat.safetensors",
        kind: "checkpoints",
        nodes: ["2 · ckpt_name"],
        download: { source: "manager", entryId: "e1", size: 100, host: "hf.co" },
      },
      {
        file: "cat.safetensors",
        kind: "checkpoints",
        nodes: ["3 · ckpt_name"],
        download: { source: "manager", entryId: "e1", size: 100, host: "hf.co" },
      },
      {
        file: "linked.pth",
        kind: "upscale_models",
        nodes: ["4 · model_name"],
        download: {
          source: "url",
          url: "https://huggingface.co/o/r/resolve/main/linked.pth",
          host: "huggingface.co",
        },
      },
      // A link to another host is ignored; a sampler isn't a model.
      { file: "evil.pth", kind: "upscale_models", nodes: ["5 · model_name"], download: null },
    ]);
  });

  it("asks for a rebuild when the canvas has nodes the import left out and ComfyUI knows them", () => {
    const prompt: ApiPrompt = { "1": { class_type: "KSampler", inputs: {} } };
    const graph = {
      nodes: [
        { id: 1, type: "KSampler" },
        { id: 2, type: "UpscaleModelLoader" },
      ],
    };
    expect(checkHealth(base(prompt, graph)).rebuild).toBe(true);
    // Different ids (an API import's laid-out canvas) can't be compared.
    expect(checkHealth(base({ "9": prompt["1"] as never }, graph)).rebuild).toBe(false);
  });

  it("checks nothing while ComfyUI is down", () => {
    expect(checkHealth({ ...base({}), info: null })).toMatchObject({ checked: false, packs: [] });
  });
});
