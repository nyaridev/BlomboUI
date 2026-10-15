import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Job, QueueSnapshot } from "../../shared/jobs.ts";
import { decodePreviewFrame, type ServerMessage } from "../../shared/live.ts";
import { createConfig, parseFlags } from "../config.ts";
import { type FakeComfy, startFakeComfy } from "./comfy/fixtures/fake-comfy.ts";
import { ComfySupervisor } from "./comfy/supervisor.ts";
import { JobQueue, nextSeed } from "./jobs.ts";
import { ProfileService } from "./profiles.ts";
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
  queue = new JobQueue({
    supervisor,
    workflows,
    profiles,
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
    expect(jobs[0]?.images[0]).toMatchObject({ type: "output", node: "9" });

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
