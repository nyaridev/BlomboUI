/**
 * The long video chain against a stand-in queue: one part at a time, each continuing the one
 * before from its saved video, with its own prompt; the parts before the last saved apart and
 * without Smooth motion; a part that doesn't finish ends the chain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Job } from "../../shared/jobs.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { ApiPrompt, ObjectInfo } from "../../shared/workflow/graph.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { readStages, type StageVideo } from "../../shared/workflow/stages.ts";
import type { JobQueue, RunSpec } from "./jobs.ts";
import { LongVideoService } from "./longvideo.ts";
import { analyze } from "./workflows/analyze.ts";
import { listStagePackages } from "./workflows/presets.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const presetsDir = path.join(here, "..", "..", "..", "presets");
const info = ObjectInfo.parse(
  JSON.parse(fs.readFileSync(path.join(here, "workflows", "fixtures", "object_info.json"), "utf8")),
);
const VIDEO: StageVideo = {
  file: "00112233aabbccdd.mp4",
  source: "output",
  label: "part.mp4",
  width: 1280,
  height: 704,
  duration: 2,
  frames: 48,
  fps: 24,
};

function setup(preset: string) {
  const prompt = ApiPrompt.parse(
    JSON.parse(fs.readFileSync(path.join(presetsDir, "workflows", preset, "prompt.json"), "utf8")),
  );
  const a = analyze(prompt, info);
  const manifest = {
    id: preset,
    name: preset,
    kind: "generate",
    bindings: a.bindings,
    values: a.values,
    run: { seedMode: "fixed", count: 1 },
    stages: { smooth: { enabled: true, multiplier: 2 } },
  } as unknown as WorkflowManifest;
  const runs: RunSpec[] = [];
  const messages: ServerMessage[] = [];
  let onFinished: (job: Job) => void = () => undefined;
  const queue = {
    saveClick: async () => manifest,
    baseSeed: () => 7,
    on: (_e: string, fn: (job: Job) => void) => {
      onFinished = fn;
    },
    addRuns: (_m: WorkflowManifest, specs: RunSpec[]) => {
      runs.push(...specs);
      return specs.map((s) => ({ id: `job-${runs.length}`, group: s.group }) as Job);
    },
  } as unknown as JobQueue;
  const copied: string[] = [];
  const service = new LongVideoService({
    queue,
    profiles: { active: "p1" },
    workflows: { prompt: async () => prompt, get: async () => manifest },
    stages: {
      packages: () => listStagePackages(presetsDir),
      // A 10 s driving video at 30 fps.
      videoInfo: async () => ({ width: 720, height: 1280, duration: 10, frames: 300, fps: 30 }),
      addVideoFromOutput: async (ref) => {
        copied.push(ref.filename);
        return VIDEO;
      },
    },
    publish: (msg) => messages.push(msg),
  });
  /** Finish the last queued part (with a video unless it failed), and let the chain go on. */
  const finish = async (state: Job["state"] = "done") => {
    const spec = runs.at(-1);
    onFinished({
      id: "x",
      state,
      group: spec?.group ?? null,
      images: [
        { filename: `part_${runs.length}.mp4`, subfolder: "wf/segments/day", type: "output" },
      ],
    } as Job);
    await new Promise((r) => setTimeout(r, 10));
  };
  return { manifest, service, runs, finish, copied, messages };
}

const body = (prompts: string[]) => ({
  workflowId: "wan22-5b",
  values: {},
  count: 1,
  loop: false,
  script: { kind: "long" as const, segments: 3, prompts },
});

describe("long video", () => {
  it("queues one part at a time, each continuing the last one's video", async () => {
    const { manifest, service, runs, finish, copied } = setup("wan22-5b");
    const positive = manifest.bindings.find((b) => b.role === "prompt.positive")?.id ?? "";
    const own = manifest.values[positive];
    const res = await service.run(body(["a fox runs", "", "the fox sleeps"]));
    expect(res.jobs).toHaveLength(1);
    expect(runs).toHaveLength(1);

    const first = runs[0];
    expect(first?.values[positive]).toBe("a fox runs");
    expect(first?.saveAs).toBe("segments");
    expect(first?.group).toMatchObject({ kind: "long", index: 0, total: 3, label: "Part 1" });
    expect(readStages(first?.stages).source.mode).toBe("txt2img");
    expect(readStages(first?.stages).smooth.enabled).toBe(false);

    await finish();
    const second = runs[1];
    expect(copied).toEqual(["part_1.mp4"]);
    expect(second?.values[positive]).toBe(own);
    expect(readStages(second?.stages).source).toMatchObject({ mode: "extend", video: VIDEO });
    expect(second?.saveAs).toBe("segments");

    await finish();
    const third = runs[2];
    expect(third?.values[positive]).toBe("the fox sleeps");
    // The last part holds the whole video: saved like any result, and smoothed once.
    expect(third?.saveAs).toBeUndefined();
    expect(readStages(third?.stages).smooth.enabled).toBe(true);
    expect(new Set(runs.map((r) => r.seed))).toEqual(new Set([7]));

    await finish();
    expect(runs).toHaveLength(3);
  });

  it("ends the chain when a part doesn't finish", async () => {
    const { service, runs, finish } = setup("wan22-5b");
    await service.run(body([]));
    await finish("interrupted");
    expect(runs).toHaveLength(1);
  });

  it("runs a swap in parts when its window of the video is longer than one run makes", async () => {
    const { manifest, service, runs } = setup("scail2-replace");
    const id = (role: string) => manifest.bindings.find((b) => b.role === role)?.id ?? "";
    const swap = (seconds: number) => ({
      workflowId: "scail2-replace",
      values: {
        [id("video.input")]: "0123456789abcdef.mp4",
        [id("video.start")]: 1,
        [id("video.seconds")]: seconds,
      },
      count: 1,
      loop: false,
    });
    // 2.5 s is 75 frames: one run (81 at most) does it.
    expect(await service.split(swap(2.5))).toBeNull();
    manifest.values = { ...manifest.values, ...swap(5).values };
    // 5 s is 150 frames: 81, then 76 more.
    const res = await service.split(swap(5));
    expect(res?.jobs).toHaveLength(1);
    expect(runs[0]?.group).toMatchObject({ kind: "long", total: 2 });
    // The first part reads only its own window (81 frames from 1 s).
    expect(runs[0]?.values[id("video.start")]).toBe(1);
    expect(runs[0]?.values[id("video.seconds")]).toBe(2.7);
  });

  it("refuses a workflow that can't continue a video", async () => {
    const { service } = setup("sd15");
    await expect(service.run(body([]))).rejects.toThrow("Long video needs a video workflow");
  });
});
