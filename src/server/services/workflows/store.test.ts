import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfig, parseFlags } from "../../config.ts";
import { fakePng } from "../../lib/test-images.ts";
import { ProfileService } from "../profiles.ts";
import { importWorkflow, readWorkflowFile } from "./import.ts";
import { WorkflowService } from "./store.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-workflows-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const config = createConfig(parseFlags(["--data", tmp]));
const profiles = new ProfileService(config);
const workflows = new WorkflowService(profiles);

const API = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "a.safetensors" } },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "a cat", clip: ["1", 1] } },
  "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["1", 1] } },
  "4": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
  "5": {
    class_type: "KSampler",
    inputs: {
      seed: 1,
      steps: 20,
      cfg: 7,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
      model: ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": { class_type: "SaveImage", inputs: { filename_prefix: "ComfyUI", images: ["6", 0] } },
};
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

beforeAll(async () => {
  const p = await profiles.create({
    name: "Workflow test",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "managed", slot: "latest" },
    presets: [],
  });
  await profiles.open(p.id);
});

describe("import", () => {
  it("reads API JSON, PNG metadata and refuses other files", () => {
    expect(readWorkflowFile(bytes(API)).source).toBe("api");
    expect(readWorkflowFile(bytes({ prompt: API })).source).toBe("api");
    expect(
      readWorkflowFile(fakePng({ prompt: JSON.stringify(API), workflow: '{"nodes":[]}' })).source,
    ).toBe("png");
    expect(() => readWorkflowFile(bytes({ hello: "world" }))).toThrow(
      /doesn't contain a ComfyUI workflow/,
    );
    expect(() => readWorkflowFile(fakePng({ parameters: "a1111 text" }))).toThrow(
      /no ComfyUI workflow/,
    );
  });

  it("needs ComfyUI for UI-format files", async () => {
    await expect(
      importWorkflow(
        { bytes: bytes({ nodes: [{ id: 1, type: "KSampler" }], links: [] }), filename: "x.json" },
        workflows,
        null,
      ),
    ).rejects.toThrow(/ComfyUI needs to be running/);
  });

  it("creates a package from an API graph", async () => {
    const result = await importWorkflow(
      { bytes: bytes(API), filename: "Cat_portrait.json" },
      workflows,
      null,
    );
    expect(result.workflow).toMatchObject({
      id: "cat-portrait",
      name: "Cat portrait",
      family: "Imported",
      kind: "generate",
    });
    expect(result.workflow.values["prompt.positive"]).toBe("a cat");
    expect(result.findings.map((f) => f.code)).toContain("no_ui_graph");
    expect((await workflows.list()).map((w) => w.id)).toContain("cat-portrait");
  });
});

describe("workflow store", () => {
  it("gives two workflows created at once with one name their own ids", async () => {
    const make = () =>
      importWorkflow({ bytes: bytes(API), filename: "Twin.json" }, workflows, null);
    const [a, b] = await Promise.all([make(), make()]);
    expect(new Set([a.workflow.id, b.workflow.id]).size).toBe(2);
    expect((await workflows.get(a.workflow.id)).id).toBe(a.workflow.id);
    expect((await workflows.get(b.workflow.id)).id).toBe(b.workflow.id);
  });

  it("saves values after a quiet period and reads the pending version meanwhile", async () => {
    await importWorkflow({ bytes: bytes(API), filename: "values.json" }, workflows, null);
    await workflows.patchValues("values", { values: { "sampler.steps": 33 } });
    await workflows.patchValues("values", {
      values: { "sampler.cfg": 4.5 },
      run: { seedMode: "fixed" },
    });
    expect((await workflows.get("values")).values).toMatchObject({
      "sampler.steps": 33,
      "sampler.cfg": 4.5,
    });
    await workflows.flush();
    const onDisk = JSON.parse(
      await fs.readFile(path.join(workflows.root(), "values", "workflow.json"), "utf8"),
    );
    expect(onDisk.values).toMatchObject({ "sampler.steps": 33, "sampler.cfg": 4.5 });
    expect(onDisk.run.seedMode).toBe("fixed");
  });

  it("duplicates into an independent copy", async () => {
    await importWorkflow({ bytes: bytes(API), filename: "original.json" }, workflows, null);
    const copy = await workflows.duplicate("original", "Original variant");
    expect(copy).toMatchObject({
      id: "original-variant",
      parentId: "original",
      name: "Original variant",
    });
    await workflows.patchValues(copy.id, { values: { "sampler.steps": 50 } });
    expect((await workflows.get("original")).values["sampler.steps"]).toBe(20);
    expect(await workflows.prompt(copy.id)).toEqual(await workflows.prompt("original"));
  });

  it("renames, and deletes into the profile's trash", async () => {
    await importWorkflow({ bytes: bytes(API), filename: "doomed.json" }, workflows, null);
    expect((await workflows.update("doomed", { name: "Renamed" })).name).toBe("Renamed");
    await workflows.remove("doomed");
    await expect(workflows.get("doomed")).rejects.toThrow(/not found/);
    const trash = await fs.readdir(path.join(workflows.root(), "..", "trash", "workflows"));
    expect(trash.some((t) => t.startsWith("doomed-"))).toBe(true);
  });

  it("rejects ids that could escape the folder", async () => {
    await expect(workflows.get("../profile")).rejects.toThrow(/Invalid workflow id/);
  });
});
