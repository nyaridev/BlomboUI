import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Job, QueueSnapshot } from "../../shared/jobs.ts";
import { decodePreviewFrame, type ServerMessage } from "../../shared/live.ts";
import { createConfig, parseFlags } from "../config.ts";
import { realPng } from "../lib/test-images.ts";
import { type FakeComfy, startFakeComfy } from "./comfy/fixtures/fake-comfy.ts";
import { ComfySupervisor } from "./comfy/supervisor.ts";
import { JobQueue, nextSeed } from "./jobs.ts";
import { ProfileService } from "./profiles.ts";
import { StageService } from "./stages.ts";
import { installPreset } from "./workflows/presets.ts";
import { WorkflowService } from "./workflows/store.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-jobs-"));
const config = createConfig(parseFlags(["--data", tmp]));
const messages: ServerMessage[] = [];
const frames: Uint8Array[] = [];
let fake: FakeComfy;
let supervisor: ComfySupervisor;
let queue: JobQueue;
let workflows: WorkflowService;
let stages: StageService;

beforeAll(async () => {
  fake = await startFakeComfy(0, 2);
  const profiles = new ProfileService(config);
  workflows = new WorkflowService(profiles);
  const wildcards = path.join(tmp, "wildcards");
  await fs.mkdir(wildcards, { recursive: true });
  await fs.writeFile(path.join(wildcards, "animal.txt"), "# animals\ncat\n");
  const p = await profiles.create({
    name: "Jobs",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards },
    comfy: { mode: "external", url: fake.url },
    presets: [],
  });
  await profiles.open(p.id);
  await installPreset(config.presetsDir, workflows, "sd15", p.id);
  supervisor = new ComfySupervisor({ runtimeDir: path.join(tmp, "runtime"), keepAlive: false });
  stages = new StageService({
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
    publish: (_topic, msg) => messages.push(msg),
    publishBinary: (_topic, frame) => frames.push(frame),
    reportError: () => undefined,
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

function settled(ids: string[], ms = 10_000): Promise<Job[]> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("jobs didn't finish")), ms);
    const check = () => {
      const jobs = queue.snapshot().jobs.filter((j) => ids.includes(j.id));
      if (
        jobs.length === ids.length &&
        jobs.every((j) => !["queued", "running"].includes(j.state))
      ) {
        clearTimeout(t);
        clearInterval(i);
        resolve(jobs);
      }
    };
    const i = setInterval(check, 10);
  });
}

describe("nextSeed", () => {
  it("follows the seed mode", () => {
    expect(nextSeed("fixed", 10, 3)).toBe(10);
    expect(nextSeed("increment", 10, 3)).toBe(13);
    expect(nextSeed("decrement", 2, 3)).toBe(0);
    expect(nextSeed("random", 10, 3)).not.toBeNaN();
  });
});

describe("job queue against a ComfyUI", () => {
  it("runs each image as its own prompt with its own seed, and streams progress", async () => {
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: {
        "sampler.seed": 100,
        "sampler.steps": 4,
        "prompt.positive": "a __animal__, <lora:detail_tweaker:0.5>",
      },
      count: 2,
      seedMode: "increment",
      loop: false,
    });
    expect(res.jobs.map((j) => j.seed)).toEqual([100, 101]);
    expect(res.values).toEqual({ "sampler.seed": 102 });

    const jobs = await settled(res.jobs.map((j) => j.id));
    expect(jobs.map((j) => j.state)).toEqual(["done", "done"]);
    expect(jobs[0]?.images[0]).toMatchObject({ type: "output", node: "8" });

    const [first] = fake.prompts.slice(-2);
    const sampler = Object.values(first?.prompt ?? {}).find((n) => n.class_type === "KSampler");
    expect(sampler?.inputs).toMatchObject({ seed: 100, steps: 4 });
    const lora = Object.values(first?.prompt ?? {}).find((n) => n.class_type === "LoraLoader");
    expect(lora?.inputs).toMatchObject({
      lora_name: "detail_tweaker.safetensors",
      strength_model: 0.5,
    });
    const text = Object.values(first?.prompt ?? {}).find((n) =>
      n.inputs.text?.toString().startsWith("a "),
    );
    expect(text?.inputs.text).toBe("a cat");
    expect(first?.extra).toMatchObject({
      preview_method: "auto",
      extra_pnginfo: { blombo: { workflow: "sd15", seed: 100 } },
    });

    expect(messages.some((m) => m.t === "job.progress" && m.progress.max === 4)).toBe(true);
    expect(messages.some((m) => m.t === "job.image")).toBe(true);
    expect(frames.length).toBeGreaterThan(0);
    expect(decodePreviewFrame(frames[0] as Uint8Array)?.mime).toBe("image/png");
    // The next click starts from the saved seed.
    expect((await workflows.get("sd15")).values["sampler.seed"]).toBe(102);
  });

  it("splices stages, uploads control images and splits progress by stage", async () => {
    const image = await stages.addImage(await realPng(64, 96), "pose.png", "upload");
    expect(image).toMatchObject({ source: "upload", label: "pose.png", width: 64, height: 96 });
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: { "sampler.steps": 3, "prompt.positive": "a cat" },
      stages: {
        hires: { enabled: true, scale: 2, upscaler: "4x-UltraSharp.pth" },
        controlnet: {
          enabled: true,
          units: [
            {
              id: "pose",
              name: "Pose",
              image,
              preprocessor: "DWPreprocessor",
              model: "control_v11p_sd15_canny.pth",
            },
          ],
        },
      },
      count: 1,
      loop: false,
    });
    const [job] = await settled(res.jobs.map((j) => j.id));
    expect(job?.state).toBe("done");
    expect(job?.segments.map((s) => s.label)).toEqual(["Sampling", "Hires fix"]);
    expect(fake.uploads).toContain(`blombo/${image.file}`);
    const sent = fake.prompts.at(-1)?.prompt ?? {};
    const classes = Object.values(sent).map((n) => n.class_type);
    expect(classes).toEqual(
      expect.arrayContaining([
        "ImageUpscaleWithModel",
        "ControlNetApplyAdvanced",
        "AIO_Preprocessor",
      ]),
    );
    expect(Object.values(sent).find((n) => n.class_type === "LoadImage")?.inputs.image).toBe(
      `blombo/${image.file}`,
    );
    // Progress reached the second segment, and the bar never went backwards.
    const ticks = messages.filter(
      (m): m is Extract<typeof m, { t: "job.progress" }> =>
        m.t === "job.progress" && m.jobId === job?.id,
    );
    expect(ticks.some((t) => t.progress.segment === 1)).toBe(true);
    const overall = ticks.map((t) => t.progress.overall);
    expect(overall).toEqual([...overall].sort((a, b) => a - b));
    // Each part was timed from `executing` and its steps, with a speed.
    expect(job?.timings.map((t) => t.label).slice(0, 2)).toEqual(["Sampling", "Hires fix"]);
    expect(job?.timings[0]).toMatchObject({ steps: 3 });
    expect(job?.timings[0]?.rate).toBeGreaterThan(0);
    expect(ticks.at(-1)?.progress.rate).toBeGreaterThan(0);
    // The stage settings were saved with the workflow.
    const saved = await workflows.get("sd15");
    expect(saved.stages.hires).toMatchObject({ enabled: true, scale: 2 });
  });

  it("reports what a finished run ran with, and runs a logged run again", async () => {
    const seen: Array<{ job: Job; values: Record<string, unknown> | null }> = [];
    const off = queue.on("finished", (job, run) => seen.push({ job, values: run?.values ?? null }));
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: { "sampler.steps": 2, "prompt.positive": "a dog", "sampler.seed": 5 },
      count: 1,
      seedMode: "fixed",
      loop: false,
    });
    await settled(res.jobs.map((j) => j.id));
    const done = seen.find((s) => s.job.id === res.jobs[0]?.id);
    expect(done?.values).toMatchObject({ "prompt.positive": "a dog" });

    const manifest = await workflows.get("sd15");
    const again = queue.rerun(manifest, { "prompt.positive": "a dog again" }, null, 77);
    const [job] = await settled([again.id]);
    expect(job?.state).toBe("done");
    expect(job?.seed).toBe(77);
    const sent = fake.prompts.at(-1)?.prompt ?? {};
    expect(Object.values(sent).find((n) => n.class_type === "KSampler")?.inputs.seed).toBe(77);
    off();
  });

  it("stops before submitting when a stage is missing something", async () => {
    const before = fake.prompts.length;
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: {},
      stages: {
        hires: { enabled: false },
        controlnet: { enabled: false },
        adetailer: { enabled: true },
      },
      count: 1,
      loop: false,
    });
    const [job] = await settled(res.jobs.map((j) => j.id));
    expect(job?.state).toBe("error");
    expect(job?.error).toBe("ADetailer · Face: pick a detector.");
    expect(fake.prompts.length).toBe(before);
    await workflows.patchValues("sd15", { values: {}, stages: { adetailer: { enabled: false } } });
  });

  it("checks stages for the Generate screen", async () => {
    const report = await stages.check("sd15", {});
    expect(report.checked).toBe(true);
    expect(report.stages.map((s) => [s.stage, s.package])).toEqual([
      ["controlnet", "controlnet-checkpoint"],
      ["hires", "hires-checkpoint"],
      ["adetailer", "adetailer-checkpoint"],
    ]);
    expect(report.stages[1]?.problems).toEqual([]);
    expect(report.stages[1]?.choices.upscaler).toContain("4x-UltraSharp.pth");
  });

  it("turns validation errors into plain messages and stops the rest of that batch", async () => {
    fake.failNext({
      "1": {
        class_type: "CheckpointLoaderSimple",
        errors: [
          {
            type: "value_not_in_list",
            message: "Value not in list",
            details: "ckpt_name: 'v1-5-pruned-emaonly.safetensors' not in [...]",
            extra_info: {
              input_name: "ckpt_name",
              received_value: "v1-5-pruned-emaonly.safetensors",
            },
          },
        ],
      },
    });
    const res = await queue.enqueue({ workflowId: "sd15", values: {}, count: 3, loop: false });
    const jobs = await settled(res.jobs.map((j) => j.id));
    expect(jobs.map((j) => j.state).sort()).toEqual(["cancelled", "cancelled", "error"]);
    expect(jobs.find((j) => j.state === "error")?.error).toBe(
      '"v1-5-pruned-emaonly.safetensors" isn\'t in your checkpoints folder. Pick another checkpoint.',
    );
  });

  it("cancelling while a run is being submitted sends nothing and keeps the queue going", async () => {
    const before = fake.prompts.length;
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: { "sampler.steps": 400 },
      count: 1,
      loop: false,
    });
    // The run is still being compiled (reading its workflow): cancel it now.
    await queue.cancelAll();
    const [cancelled] = await settled([res.jobs[0]?.id as string]);
    expect(cancelled?.state).toBe("interrupted");
    expect(fake.prompts.length).toBe(before);
    const next = await queue.enqueue({
      workflowId: "sd15",
      values: { "sampler.steps": 3 },
      count: 1,
      loop: false,
    });
    const [done] = await settled([next.jobs[0]?.id as string]);
    expect(done?.state).toBe("done");
    expect(fake.prompts.length).toBe(before + 1);
  });

  it("keeps a running image through a dropped connection to ComfyUI", async () => {
    const runOne = async (steps: number) => {
      const res = await queue.enqueue({
        workflowId: "sd15",
        values: { "sampler.steps": steps },
        count: 1,
        loop: false,
      });
      const id = res.jobs[0]?.id as string;
      const started = Date.now();
      while (!queue.snapshot().jobs.find((j) => j.id === id)?.promptId) {
        if (Date.now() - started > 5000) throw new Error("never started");
        await new Promise((r) => setTimeout(r, 10));
      }
      fake.dropSockets();
      const [job] = await settled([id], 15_000);
      return job;
    };
    // Still rendering when Blombo reconnects: its events resume.
    expect((await runOne(400))?.state).toBe("done");
    // Finished while the connection was down: found in ComfyUI's history, with its image.
    const quick = await runOne(60);
    expect(quick?.state).toBe("done");
    expect(quick?.images.length).toBeGreaterThan(0);
  });

  it("cancels: interrupts the running image and drops the queue", async () => {
    const res = await queue.enqueue({
      workflowId: "sd15",
      values: { "sampler.steps": 400 },
      count: 3,
      loop: false,
    });
    await new Promise((r) => setTimeout(r, 60));
    await queue.cancelAll();
    const jobs = await settled(res.jobs.map((j) => j.id));
    expect(jobs.map((j) => j.state).sort()).toEqual(["cancelled", "cancelled", "interrupted"]);
    const snap: QueueSnapshot = queue.snapshot();
    expect(snap.loop).toBe(false);
    expect(snap.jobs.filter((j) => j.state === "queued" || j.state === "running")).toEqual([]);
  });
});
