/**
 * Runs that belong together, end to end against the fake ComfyUI: a script's cells (an XY plot
 * becomes one grid, scope thumbnails land in the profile) and a batch's files (images and
 * captions in the output folder, existing results skipped, cancel).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BatchRun } from "../../shared/batch.ts";
import type { Job } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { createConfig, parseFlags } from "../config.ts";
import { realPng } from "../lib/test-images.ts";
import { BatchService, captionText, listImages } from "./batch.ts";
import { type FakeComfy, startFakeComfy } from "./comfy/fixtures/fake-comfy.ts";
import { ComfySupervisor } from "./comfy/supervisor.ts";
import { JobQueue } from "./jobs.ts";
import { ProfileService } from "./profiles.ts";
import { scopeThumbPath } from "./scopes.ts";
import { ScriptService } from "./scripts.ts";
import { StageService } from "./stages.ts";
import { installPreset } from "./workflows/presets.ts";
import { INSTALL_IN_COMFY } from "./workflows/stages.ts";
import { WorkflowService } from "./workflows/store.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-groups-"));
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const outputs = path.join(tmp, "outputs");
const messages: ServerMessage[] = [];
let fake: FakeComfy;
let supervisor: ComfySupervisor;
let queue: JobQueue;
let scripts: ScriptService;
let batch: BatchService;
let profiles: ProfileService;
let profileId = "";

beforeAll(async () => {
  // The fake writes saved images into the outputs folder, like a managed ComfyUI.
  fake = await startFakeComfy(0, 1, outputs);
  profiles = new ProfileService(config);
  const workflows = new WorkflowService(profiles);
  const p = await profiles.create({
    name: "Groups",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs, wildcards: "" },
    comfy: { mode: "external", url: fake.url },
    presets: [],
  });
  profileId = p.id;
  await profiles.open(p.id);
  for (const id of ["sd15", "caption", "dataset-prep"])
    await installPreset(config.presetsDir, workflows, id, p.id);
  supervisor = new ComfySupervisor({ runtimeDir: path.join(tmp, "runtime"), keepAlive: false });
  const stages = new StageService({
    presetsDir: config.presetsDir,
    profiles,
    workflows,
    supervisor,
    gallery: null as never,
  });
  queue = new JobQueue({
    supervisor,
    workflows,
    profiles,
    stages,
    publish: (_t, msg) => messages.push(msg),
    publishBinary: () => undefined,
    reportError: () => undefined,
  });
  scripts = new ScriptService({
    queue,
    profiles,
    supervisor,
    publish: (msg) => messages.push(msg),
  });
  batch = new BatchService({
    queue,
    workflows,
    profiles,
    supervisor,
    publish: (_t, msg) => messages.push(msg),
    runtimeDir: path.join(tmp, "runtime"),
  });
  const ready = new Promise<void>((resolve) =>
    supervisor.on("status", (s) => s.state === "running" && resolve()),
  );
  await supervisor.applyProfile(p);
  await ready;
});

afterAll(async () => {
  await supervisor.shutdown();
  await fake.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

/** Resolves with the grid job once a script's grid is in the queue's list. */
function gridJob(groupId: string, ms = 15_000): Promise<Job> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no grid")), ms);
    const i = setInterval(() => {
      const job = queue
        .snapshot()
        .jobs.find((j) => j.group?.kind === "grid" && j.group.id === groupId);
      if (job) {
        clearTimeout(t);
        clearInterval(i);
        resolve(job);
      }
    }, 20);
  });
}

function batchDone(ms = 15_000): Promise<BatchRun> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("batch didn't finish")), ms);
    const i = setInterval(() => {
      const run = batch.snapshot().run;
      if (run && run.state !== "running") {
        clearTimeout(t);
        clearInterval(i);
        resolve(run);
      }
    }, 20);
  });
}

describe("scripts", () => {
  it("queue one job per XY cell with one seed, and put the results into a labeled grid", async () => {
    const res = await scripts.run({
      workflowId: "sd15",
      values: { "sampler.steps": 3, "sampler.seed": 77 },
      count: 1,
      seedMode: "fixed",
      loop: false,
      script: {
        kind: "xy",
        x: { type: "binding", binding: "sampler.cfg", values: [4, 6, 8] },
        y: { type: "binding", binding: "sampler.steps", values: [2, 3] },
        grid: true,
      },
    });
    expect(res.jobs).toHaveLength(6);
    expect(new Set(res.jobs.map((j) => j.seed))).toEqual(new Set([77]));
    const groupId = res.jobs[0]?.group?.id as string;
    const grid = await gridJob(groupId);
    expect(grid.file?.url).toBe(`/api/scripts/grids/${grid.id}`);
    const file = grid.file?.path as string;
    expect(path.dirname(file).startsWith(outputs)).toBe(true);
    expect(path.basename(path.dirname(file))).toBe("grids");
    const meta = await sharp(await fs.readFile(file)).metadata();
    expect(meta.width).toBe(grid.width);
    expect(scripts.gridFile(grid.id)).toBe(file);
    // The cells really ran with the axis values.
    const cfgs = fake.prompts
      .slice(-6)
      .map((p) => p.prompt["3"]?.inputs.cfg ?? p.prompt["6"]?.inputs.cfg);
    expect(cfgs.filter((v) => v !== undefined).length).toBeGreaterThan(0);
  });

  it("files each model's image as its scope thumbnail", async () => {
    const res = await scripts.run({
      workflowId: "sd15",
      values: {},
      count: 1,
      loop: false,
      script: {
        kind: "thumbs",
        target: "model",
        binding: "model.checkpoint",
        models: ["sd15/dreamshaper_8.safetensors"],
        scope: "default",
        loraWeight: 1,
      },
    });
    expect(res.jobs).toHaveLength(1);
    const thumb = scopeThumbPath(
      profiles.dir(profileId),
      "default",
      "checkpoints",
      "sd15/dreamshaper_8.safetensors",
    ) as string;
    for (let i = 0; i < 200 && !(await fs.stat(thumb).catch(() => null)); i++)
      await new Promise((r) => setTimeout(r, 25));
    expect((await sharp(await fs.readFile(thumb)).metadata()).format).toBe("webp");
  });

  it("refuses a plan that can't work, saying why", async () => {
    await expect(
      scripts.run({
        workflowId: "sd15",
        values: {},
        count: 1,
        loop: false,
        script: {
          kind: "xy",
          x: { type: "replace", binding: "prompt.positive", values: ["unicorn", "dragon"] },
          y: null,
          grid: true,
        },
      }),
    ).rejects.toThrow(/"unicorn" isn't in prompt/);
  });
});

describe("batch runner", () => {
  it("captions every image in a folder into sidecar .txt files and skips finished ones", async () => {
    const input = path.join(tmp, "shots");
    await fs.mkdir(path.join(input, "sub"), { recursive: true });
    for (const name of ["b.png", "a.png", "sub/c.png", "notes.txt"])
      await fs.writeFile(path.join(input, name), name.endsWith(".png") ? await realPng(8, 8) : "x");
    expect((await listImages(input, false)).map((f) => path.basename(f))).toEqual([
      "a.png",
      "b.png",
    ]);

    const out = path.join(tmp, "captions");
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, "b.txt"), "done before");
    const run = await batch.start({
      workflowId: "caption",
      values: {},
      source: { type: "folder", folder: input, recursive: true },
      output: out,
      skipExisting: true,
      captionPrefix: "mychar",
    });
    // (The first file may already be running.)
    expect(run.items.map((i) => [i.name, i.state === "running" ? "queued" : i.state])).toEqual([
      ["a.png", "queued"],
      ["b.png", "skipped"],
      [path.join("sub", "c.png"), "queued"],
    ]);
    const done = await batchDone();
    expect(done.state).toBe("done");
    expect(done.items.map((i) => i.state)).toEqual(["done", "skipped", "done"]);
    expect(await fs.readFile(path.join(out, "a.txt"), "utf8")).toMatch(/^mychar, 1girl, solo/);
    expect(await fs.readFile(path.join(out, "b.txt"), "utf8")).toBe("done before");
    expect(await fs.readFile(path.join(out, "sub", "c.txt"), "utf8")).toMatch(/^mychar, /);
    // Each file went to ComfyUI's input folder before its run.
    expect(fake.uploads.filter((u) => u.startsWith("blombo/batch/")).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("writes images and captions for dropped files, never over the input, and can be stopped", async () => {
    const staged = await batch.stage(await realPng(8, 8), "portrait 01.png");
    expect(staged.name).toBe("portrait 01.png");
    const out = path.join(tmp, "dataset");
    const run = await batch.start({
      workflowId: "dataset-prep",
      values: {},
      source: { type: "files", files: [staged] },
      output: out,
      skipExisting: false,
      captionPrefix: "",
    });
    const done = await batchDone();
    expect(done.id).toBe(run.id);
    expect(done.items[0]?.outputs.sort()).toEqual(["portrait 01.png", "portrait 01.txt"]);
    expect(
      (await sharp(await fs.readFile(path.join(out, "portrait 01.png"))).metadata()).format,
    ).toBe("png");

    // Again without skipping: the previous results move to the profile's trash.
    await batch.start({
      workflowId: "dataset-prep",
      values: {},
      source: { type: "files", files: [staged] },
      output: out,
      skipExisting: false,
      captionPrefix: "",
    });
    await batchDone();
    const trash = path.join(profiles.dir(profileId), "trash", "batch");
    expect((await fs.readdir(trash)).length).toBe(1);

    // Many files, stopped right away: what didn't run is cancelled.
    const many = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => batch.stage(await realPng(4 + i, 4), `x${i}.png`)),
    );
    await batch.start({
      workflowId: "caption",
      values: {},
      source: { type: "files", files: many },
      output: path.join(tmp, "stopped"),
      skipExisting: true,
      captionPrefix: "",
    });
    await batch.cancel();
    const stopped = await batchDone();
    expect(stopped.state).toBe("cancelled");
    expect(stopped.items.filter((i) => i.state === "cancelled").length).toBeGreaterThan(0);
  });

  it("refuses a generate workflow and a folder without images", async () => {
    await expect(
      batch.start({
        workflowId: "sd15",
        values: {},
        source: { type: "folder", folder: tmp, recursive: false },
        output: path.join(tmp, "x"),
        skipExisting: true,
        captionPrefix: "",
      }),
    ).rejects.toThrow(/isn't a batch workflow/);
    const empty = path.join(tmp, "empty");
    await fs.mkdir(empty, { recursive: true });
    await expect(
      batch.start({
        workflowId: "caption",
        values: {},
        source: { type: "folder", folder: empty, recursive: false },
        output: path.join(tmp, "x"),
        skipExisting: true,
        captionPrefix: "",
      }),
    ).rejects.toThrow(/has no images/);
  });

  it("says which custom nodes and models a batch workflow is missing", async () => {
    expect(await batch.check("caption")).toEqual({
      checked: true,
      problems: [],
      makesImages: false,
      makesText: true,
    });
    expect(await batch.check("dataset-prep")).toMatchObject({ makesImages: true, makesText: true });
    const info = (await supervisor.objectInfo()) ?? {};
    const { "WD14Tagger|pysssss": _gone, ...without } = info;
    const lackingWith = (trusted: string[]) =>
      new BatchService({
        queue,
        workflows: new WorkflowService(profiles),
        profiles,
        supervisor: {
          api: null,
          objectInfo: async () => without,
          status: () => ({ ...supervisor.status(), mode: "managed" }),
        },
        publish: () => undefined,
        runtimeDir: path.join(tmp, "runtime"),
        trustedPacks: async () => trusted,
      });
    // A pack the installer doesn't trust (an imported bundle's) is installed inside ComfyUI.
    const untrusted = await lackingWith([]).check("caption");
    expect(untrusted.problems[0]?.message).toBe(
      `Caption images needs WD14 Tagger. ${INSTALL_IN_COMFY}`,
    );
    const lacking = lackingWith(["https://github.com/pythongosssss/ComfyUI-WD14-Tagger"]);
    const report = await lacking.check("caption");
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({
      code: "missing_nodes",
      message:
        "Caption images needs WD14 Tagger. Install adds them to this ComfyUI and restarts it.",
    });
    expect(report.problems[0]?.packs?.[0]?.ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it("puts the caption prefix first", () => {
    expect(captionText("trigger, ", ["1girl, smile"])).toBe("trigger, 1girl, smile");
    expect(captionText("", ["a", "b"])).toBe("a\nb");
    expect(captionText("only", [])).toBe("only");
  });
});
