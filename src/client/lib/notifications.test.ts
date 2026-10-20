import type { Job } from "@shared/jobs";
import { NotificationSettings } from "@shared/settings";
import { describe, expect, it } from "vitest";
import { downloadNotes, queueNotes } from "./notifications";

const s = NotificationSettings.parse({ minSeconds: 10 });

function job(id: string, state: Job["state"], secs = 30, group?: Job["group"]): Job {
  const start = Date.parse("2026-10-20T10:00:00Z");
  return {
    id,
    seq: 1,
    workflowId: "sd15",
    workflowName: "SD 1.5",
    state,
    seed: 1,
    width: 512,
    height: 768,
    segments: [],
    createdAt: new Date(start).toISOString(),
    startedAt: new Date(start).toISOString(),
    finishedAt: live(state) ? null : new Date(start + secs * 1000).toISOString(),
    progress: { value: 0, max: 1, node: null, overall: 0, segment: 0, rate: null },
    images: [],
    texts: [],
    error: state === "error" ? "Out of memory" : null,
    promptId: null,
    group: group ?? null,
    file: null,
    timings: [],
  };
}
function live(state: string) {
  return state === "queued" || state === "running";
}
const g = (id: string, index: number, total: number): Job["group"] => ({
  id,
  kind: "xy",
  title: "XY plot",
  index,
  total,
  label: "",
});

describe("notifications", () => {
  it("announces a long run, not a quick one", () => {
    expect(queueNotes([job("a", "running")], [job("a", "done", 30)], s)).toEqual([
      { title: "Your image is ready", body: "SD 1.5 · 512×768" },
    ]);
    expect(queueNotes([job("a", "running")], [job("a", "done", 3)], s)).toEqual([]);
    expect(queueNotes([job("a", "running")], [job("a", "error", 30)], s)[0]).toEqual({
      title: "SD 1.5 failed",
      body: "Out of memory",
    });
  });

  it("announces a script once, when its last run is done", () => {
    const prev = [job("1", "running", 0, g("x", 0, 2)), job("2", "queued", 0, g("x", 1, 2))];
    const mid = [job("1", "done", 5, g("x", 0, 2)), job("2", "running", 0, g("x", 1, 2))];
    expect(queueNotes(prev, mid, s)).toEqual([]);
    const end = [job("1", "done", 5, g("x", 0, 2)), job("2", "error", 5, g("x", 1, 2))];
    expect(queueNotes(mid, end, s)).toEqual([
      { title: "XY plot finished", body: "1 run done, 1 failed." },
    ]);
  });

  it("follows the settings", () => {
    const off = NotificationSettings.parse({ enabled: false });
    expect(queueNotes([job("a", "running")], [job("a", "done", 60)], off)).toEqual([]);
    const noJobs = NotificationSettings.parse({ jobs: false });
    expect(queueNotes([job("a", "running")], [job("a", "done", 60)], noJobs)).toEqual([]);
  });

  it("announces finished and failed downloads", () => {
    const d = (state: "running" | "done" | "error") =>
      ({ id: "d", name: "Detail Tweaker", state }) as never;
    expect(downloadNotes([d("running")], [d("done")], s)).toEqual([
      { title: "Download finished", body: "Detail Tweaker" },
    ]);
    expect(downloadNotes([d("done")], [d("done")], s)).toEqual([]);
    expect(downloadNotes([], [d("error")], s)).toEqual([]);
  });
});
