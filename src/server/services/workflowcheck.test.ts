import { describe, expect, it } from "vitest";
import type { ApiPrompt, ObjectInfo } from "../../shared/workflow/graph.ts";
import type { NodePack } from "../../shared/workflow/packs.ts";
import { parseNodeMap } from "./nodemap.ts";
import { WorkflowCheck, type WorkflowCheckDeps } from "./workflowcheck.ts";

const prompt: ApiPrompt = {
  "1": { class_type: "MappedNode", inputs: {} },
  "2": { class_type: "Mystery", inputs: {} },
  "3": { class_type: "Loader", inputs: { model_name: "linked.pth" } },
};
const graph = {
  nodes: [
    {
      id: 3,
      type: "Loader",
      properties: {
        models: [
          {
            name: "linked.pth",
            url: "https://huggingface.co/o/r/resolve/main/linked.pth",
            directory: "upscale_models",
          },
        ],
      },
    },
  ],
};
const info = {
  Loader: { input: { required: { model_name: [["other.pth"]] } }, output: [] },
} as unknown as ObjectInfo;

function make(
  saved: { bindings: unknown[]; values: Record<string, unknown> } = { bindings: [], values: {} },
) {
  const installs: { urls: string[]; confirmed: NodePack[] }[] = [];
  const downloads: unknown[] = [];
  const deps = {
    workflows: {
      get: async () => saved,
      prompt: async () => prompt,
      graph: async () => graph,
    },
    supervisor: { objectInfo: async () => info },
    installer: {
      start: async (urls: string[], confirmed: NodePack[]) => {
        installs.push({ urls, confirmed });
      },
    },
    downloads: { enqueue: async (b: unknown) => downloads.push(b) },
    catalog: { catalog: async () => ({ entries: [] }) },
    nodeMap: {
      entries: async () =>
        parseNodeMap({ "https://github.com/m/mapped": [["MappedNode"], { title_aux: "Mapped" }] }),
    },
    known: async () => [],
    huggingface: null,
  } as unknown as WorkflowCheckDeps;
  return { check: new WorkflowCheck(deps), installs, downloads };
}

describe("WorkflowCheck", () => {
  it("installs only packs the check found, and a typed repo only for unknown classes", async () => {
    const { check, installs } = make();
    await expect(
      check.install("w", { packs: ["https://github.com/evil/pack"] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      check.install("w", { repo: { url: "https://github.com/me/mine", nodes: ["MappedNode"] } }),
    ).rejects.toMatchObject({ status: 409 });
    await check.install("w", {
      packs: ["https://github.com/m/mapped"],
      repo: { url: "https://github.com/me/mine", nodes: ["Mystery"] },
    });
    expect(installs).toEqual([
      {
        urls: ["https://github.com/m/mapped", "https://github.com/me/mine"],
        confirmed: [
          { name: "Mapped", url: "https://github.com/m/mapped", nodes: ["MappedNode"] },
          { name: "mine", url: "https://github.com/me/mine", nodes: ["Mystery"] },
        ],
      },
    ]);
  });

  it("checks the models you picked, not the ones the graph was saved with", async () => {
    const bindings = [{ id: "up", node: "3", input: "model_name", type: "model" }];
    // The graph names linked.pth; you picked other.pth, which ComfyUI has.
    const picked = make({ bindings, values: { up: "other.pth" } });
    expect((await picked.check.check("w")).models).toEqual([]);
    // A pick on screen that isn't saved yet wins over the saved one.
    const unsaved = make({ bindings, values: { up: "linked.pth" } });
    expect((await unsaved.check.check("w", { up: "other.pth" })).models).toEqual([]);
    expect((await unsaved.check.check("w")).models.map((m) => m.file)).toEqual(["linked.pth"]);
  });

  it("downloads only a file the check offers, from the address it found", async () => {
    const { check, downloads } = make();
    await expect(check.download("w", "other.pth")).rejects.toMatchObject({ status: 409 });
    await check.download("w", "linked.pth");
    expect(downloads).toEqual([
      {
        source: "url",
        url: "https://huggingface.co/o/r/resolve/main/linked.pth",
        file: "linked.pth",
        kind: "upscale_models",
      },
    ]);
  });
});
