import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GalleryImage } from "../../shared/gallery.ts";
import type { Job } from "../../shared/jobs.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { createConfig, parseFlags } from "../config.ts";
import { ProfileDbs } from "../db/profileDb.ts";
import type { GalleryService } from "./gallery/index.ts";
import { HistoryService, usesOf } from "./history.ts";
import { ProfileService } from "./profiles.ts";
import { SnippetService } from "./snippets.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-history-"));
const config = createConfig(parseFlags(["--data", path.join(tmp, "data")]));
const profiles = new ProfileService(config);
const dbs = new ProfileDbs((id) => path.join(profiles.dir(id), "blombo.sqlite"));
const indexed: GalleryImage = {
  id: 7,
  library: "outputs",
  path: "2026-10-20/sd15_00001_.png",
  name: "sd15_00001_.png",
  width: 512,
  height: 768,
  size: 10,
  mtime: 1,
  favorite: false,
  rating: 0,
  model: null,
  thumb: "/api/gallery/thumbs/7?v=1",
};
const gallery = {
  findOutputs: (refs: Array<{ filename: string; subfolder: string }>) =>
    new Map(
      refs
        .map((r) => `${r.subfolder}/${r.filename}`)
        .filter((k) => k === indexed.path)
        .map((k) => [k, indexed] as const),
    ),
} as unknown as GalleryService;
const history = new HistoryService({ profiles, dbs, gallery });
const snippets = new SnippetService(profiles);

const manifest = {
  id: "sd15",
  name: "SD 1.5",
  kind: "generate",
  bindings: [
    { id: "prompt.positive", role: "prompt.positive", node: "6", input: "text", type: "prompt" },
    { id: "prompt.negative", role: "prompt.negative", node: "7", input: "text", type: "prompt" },
    {
      id: "model.checkpoint",
      role: "model.checkpoint",
      node: "4",
      input: "ckpt_name",
      type: "model",
    },
  ],
} as unknown as WorkflowManifest;

let n = 0;
function job(patch: Partial<Job> = {}): Job {
  const start = Date.parse("2026-10-20T10:00:00Z") + n * 60_000;
  n++;
  return {
    id: `job-${n}`,
    seq: n,
    workflowId: "sd15",
    workflowName: "SD 1.5",
    state: "done",
    seed: 100 + n,
    width: 512,
    height: 768,
    segments: [],
    createdAt: new Date(start - 1000).toISOString(),
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + 4000).toISOString(),
    progress: { value: 1, max: 1, node: null, overall: 1, segment: 0, rate: null },
    images: [{ filename: "sd15_00001_.png", subfolder: "2026-10-20", type: "output", node: "9" }],
    texts: [],
    error: null,
    promptId: "p",
    group: null,
    file: null,
    timings: [{ label: "Sampling", ms: 2000, steps: 20, rate: 10 }],
    ...patch,
  };
}

beforeAll(async () => {
  const p = await profiles.create({
    name: "History",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:1" },
    presets: [],
  });
  await profiles.open(p.id);
});

afterAll(async () => {
  dbs.closeAll();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("usesOf", () => {
  it("reads the model, prompts, LoRA tags and wildcards from the values", () => {
    expect(
      usesOf(manifest, {
        "model.checkpoint": "sd15/dream.safetensors",
        "prompt.positive": "a __animal__, <lora:detail:0.5>, {red|blue}",
        "prompt.negative": "blurry, <lora:bad_hands:1>",
      }),
    ).toEqual({
      model: "sd15/dream.safetensors",
      prompt: "a __animal__, <lora:detail:0.5>, {red|blue}",
      negative: "blurry, <lora:bad_hands:1>",
      loras: ["detail", "bad_hands"],
      wildcards: ["animal"],
    });
  });
});

describe("job log", () => {
  it("logs finished runs with what they used, and finds their gallery image", () => {
    const values = {
      "model.checkpoint": "dream.safetensors",
      "prompt.positive": "a __animal__ <lora:detail:0.5>",
    };
    history.record(job(), { manifest, values, stages: {} as WorkflowManifest["stages"] });
    history.record(job({ state: "error", error: "Out of memory", images: [], timings: [] }), {
      manifest,
      values: { ...values, "prompt.positive": "a castle" },
      stages: {} as WorkflowManifest["stages"],
    });
    // Cancelled before it ran: not worth a row.
    history.record(job({ state: "cancelled", startedAt: null }), {
      manifest,
      values,
      stages: {} as WorkflowManifest["stages"],
    });
    const page = history.list({});
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ state: "error", prompt: "a castle", thumb: null });
    expect(page.items[1]).toMatchObject({
      state: "done",
      model: "dream.safetensors",
      loras: ["detail"],
      wildcards: ["animal"],
      durationMs: 4000,
      imageId: 7,
      thumb: indexed.thumb,
    });
    expect(history.list({ state: "failed" }).total).toBe(1);
    expect(history.list({ q: "castle" }).items.map((r) => r.prompt)).toEqual(["a castle"]);
    const detail = history.detail(page.items[1]?.id as string);
    expect(detail.values).toEqual(values);
  });

  it("answers prompt history, recent models and usage stats", () => {
    expect(history.prompts("", 10).map((p) => p.text)).toEqual([
      "a castle",
      "a __animal__ <lora:detail:0.5>",
    ]);
    expect(history.modelMarks().recent).toEqual(["dream.safetensors", "detail"]);
    const stats = history.stats({ images: 3, favorites: 1 });
    expect(stats.generated.total).toBe(1);
    expect(stats.runs).toEqual({ total: 2, failed: 1 });
    expect(stats.gpuMs.total).toBe(8000);
    expect(stats.models).toEqual([{ name: "dream.safetensors", count: 1 }]);
    expect(stats.loras).toEqual([{ name: "detail", count: 1 }]);
    expect(stats.wildcards).toEqual([{ name: "animal", count: 1 }]);
    expect(stats.perDay).toHaveLength(14);
    expect(stats.gallery).toEqual({ images: 3, favorites: 1 });
  });

  it("keeps favorite models for the pickers", () => {
    history.setModelFavorite("loras", "detail.safetensors", true);
    expect(history.modelMarks().favorites).toEqual(["loras/detail.safetensors"]);
    history.setModelFavorite("loras", "detail.safetensors", false);
    expect(history.modelMarks().favorites).toEqual([]);
  });

  it("keeps and clears errors", () => {
    history.addError({ id: "e1", at: 1, source: "job", title: "SD 1.5 failed", detail: "OOM" });
    history.addError({ id: "e2", at: 2, source: "comfy", title: "Crashed", detail: "" });
    expect(history.errors().map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(history.clearErrors(["e1"])).toBe(1);
    expect(history.clearErrors()).toBe(1);
    expect(history.errors()).toEqual([]);
  });

  it("removes runs from the log", () => {
    const [first] = history.list({}).items;
    expect(history.remove([first?.id as string])).toBe(1);
    expect(history.remove("all")).toBe(1);
    expect(history.list({}).total).toBe(0);
  });
});

describe("snippets", () => {
  it("saves, renames and removes snippets in snippets.json", async () => {
    const a = await snippets.save({ name: "Quality", text: "masterpiece, best quality" });
    const b = await snippets.save({ name: "Quality", text: "absurdres" });
    expect([a.id, b.id]).toEqual(["quality", "quality-2"]);
    await snippets.save({ id: "quality", name: "Quality tags", text: "masterpiece" });
    await snippets.remove("quality-2");
    expect(await snippets.list()).toEqual([
      { id: "quality", name: "Quality tags", text: "masterpiece" },
    ]);
    const file = JSON.parse(
      await fs.readFile(
        path.join(profiles.dir(profiles.active as string), "snippets.json"),
        "utf8",
      ),
    );
    expect(file.format).toBe("blombo.snippets/1");
  });
});
