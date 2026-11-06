/**
 * Comparisons end to end against the fake ComfyUI: every combination runs with one seed, each
 * result gets the image the gallery indexed, adding a value runs only the new combinations,
 * a clone starts empty, a restart settles what was running, and removing keeps the file in the
 * trash.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompareTask } from "../../shared/compare.ts";
import type { GalleryImage } from "../../shared/gallery.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { createConfig, parseFlags } from "../config.ts";
import { type FakeComfy, startFakeComfy } from "./comfy/fixtures/fake-comfy.ts";
import { ComfySupervisor } from "./comfy/supervisor.ts";
import { CompareService } from "./compare.ts";
import { JobQueue } from "./jobs.ts";
import { ProfileService } from "./profiles.ts";
import { StageService } from "./stages.ts";
import { installPreset } from "./workflows/presets.ts";
import { WorkflowService } from "./workflows/store.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-compare-"));
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const outputs = path.join(tmp, "outputs");
const messages: ServerMessage[] = [];
let fake: FakeComfy;
let supervisor: ComfySupervisor;
let queue: JobQueue;
let profiles: ProfileService;
let workflows: WorkflowService;
let compare: CompareService;
let nextId = 1;

function service(): CompareService {
  return new CompareService({
    queue,
    profiles,
    workflows,
    publish: (msg) => messages.push(msg),
    loraWeight: async () => () => null,
  });
}

beforeAll(async () => {
  fake = await startFakeComfy(0, 1, outputs);
  profiles = new ProfileService(config);
  workflows = new WorkflowService(profiles);
  const p = await profiles.create({
    name: "Compare",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs, wildcards: "" },
    comfy: { mode: "external", url: fake.url },
    presets: [],
  });
  await profiles.open(p.id);
  await installPreset(config.presetsDir, workflows, "sd15", p.id);
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
    publish: (_t, msg) => {
      messages.push(msg);
      // The gallery's part: index the image, hand it over.
      if (msg.t === "job.image") {
        const image = {
          id: nextId++,
          name: msg.image.filename,
          width: 64,
          height: 64,
          size: 1,
          mtime: 1,
          thumb: `/thumb/${msg.image.filename}`,
        } as GalleryImage;
        setTimeout(() => compare.onImage(msg.jobId, image), 5);
      }
    },
    publishBinary: () => undefined,
    reportError: () => undefined,
  });
  compare = service();
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

async function settled(id: string, ms = 20_000): Promise<CompareTask> {
  const end = Date.now() + ms;
  for (;;) {
    const task = (await compare.list()).find((t) => t.id === id);
    if (task && !task.running && task.results.every((r) => r.state !== "done" || r.image))
      return task;
    if (Date.now() > end)
      throw new Error(
        `the comparison didn't finish: ${JSON.stringify(task?.results.map((r) => [r.state, r.image?.id]))} ${task?.running}`,
      );
    await new Promise((r) => setTimeout(r, 30));
  }
}

const rows = [
  { type: "sampler.name", text: "", picks: ["euler", "heun"] },
  { type: "sampler.cfg", text: "4, 6", picks: [] },
];

describe("CompareService", () => {
  it("runs every combination with one seed and keeps each image", { timeout: 30_000 }, async () => {
    const task = await compare.create({
      workflowId: "sd15",
      values: { "prompt.positive": "a red fox" },
      name: "",
      axes: rows,
    });
    expect(task.seed).not.toBeNull();
    const started = await compare.start(task.id, "missing");
    expect(started.running).toBe(true);
    expect(started.results).toHaveLength(4);
    const jobs = queue.snapshot().jobs.filter((j) => j.group?.id === task.id);
    expect(jobs).toHaveLength(4);
    expect(new Set(jobs.map((j) => j.seed))).toEqual(new Set([task.seed]));

    const done = await settled(task.id);
    expect(done.results.map((r) => r.state)).toEqual(["done", "done", "done", "done"]);
    expect(done.results.every((r) => r.image?.url.startsWith("/api/gallery/images/"))).toBe(true);
    expect(messages.some((m) => m.t === "compare.result" && m.id === task.id)).toBe(true);
  });

  it("runs only new combinations, and nothing when every image is there", {
    timeout: 30_000,
  }, async () => {
    const task = (await compare.list())[0] as CompareTask;
    await expect(compare.start(task.id, "missing")).rejects.toThrow(/made already/);
    await compare.update(task.id, {
      axes: [rows[0], { ...rows[1], text: "4, 6, 8" }] as typeof rows,
    });
    const started = await compare.start(task.id, "missing");
    expect(started.results.filter((r) => r.state === "queued")).toHaveLength(2);
    const done = await settled(task.id);
    expect(done.results).toHaveLength(6);
    expect(done.results.every((r) => r.state === "done")).toBe(true);
  });

  it("clones without images, and stops", { timeout: 30_000 }, async () => {
    const task = (await compare.list())[0] as CompareTask;
    const copy = await compare.clone(task.id);
    expect(copy.results).toEqual([]);
    expect(copy.axes).toEqual(task.axes);
    await compare.start(copy.id, "all");
    await compare.stop(copy.id);
    const stopped = await settled(copy.id);
    expect(stopped.results.some((r) => r.state === "cancelled")).toBe(true);
  });

  it("settles a comparison that was running when the server stopped", {
    timeout: 30_000,
  }, async () => {
    const task = (await compare.list())[0] as CompareTask;
    const file = path.join(profiles.dir(profiles.active ?? ""), "compare", `${task.id}.json`);
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    saved.running = true;
    saved.results[0].state = "running";
    await fs.writeFile(file, JSON.stringify(saved));
    const fresh = service();
    const read = (await fresh.list()).find((t) => t.id === task.id);
    expect(read?.running).toBe(false);
    expect(read?.results[0]?.state).toBe("cancelled");
  });

  it("moves a removed comparison's file to the trash", { timeout: 30_000 }, async () => {
    const task = (await compare.list())[0] as CompareTask;
    await compare.remove(task.id);
    expect((await compare.list()).some((t) => t.id === task.id)).toBe(false);
    const trash = path.join(profiles.dir(profiles.active ?? ""), "trash", "compare");
    expect(await fs.readdir(trash)).toContain(`${task.id}.json`);
  });
});
