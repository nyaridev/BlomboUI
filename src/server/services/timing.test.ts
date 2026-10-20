import { describe, expect, it } from "vitest";
import { RunClock } from "./timing.ts";

const segments = [
  { id: "base", label: "Sampling", nodes: ["3"] },
  { id: "hires", label: "Hires fix", nodes: ["20"] },
];

describe("RunClock", () => {
  it("times each segment's sampler and counts its steps", () => {
    const clock = new RunClock(segments, 0);
    clock.executing("4", 0); // load model: Other
    clock.executing("3", 1000);
    expect(clock.progress("3", 1, 1500)).toBeCloseTo(2);
    clock.progress("3", 10, 3000);
    clock.executing("8", 3000); // decode: Other
    clock.executing("20", 3500);
    clock.progress("20", 5, 5500);
    const t = clock.finish(6000);
    expect(t).toEqual([
      { label: "Sampling", ms: 2000, steps: 10, rate: 5 },
      { label: "Hires fix", ms: 2500, steps: 5, rate: 2 },
      { label: "Other", ms: 1500, steps: 0, rate: null },
    ]);
  });

  it("adds up repeated passes of one node (a detailer per face)", () => {
    const clock = new RunClock([{ id: "ad", label: "ADetailer", nodes: ["30"] }], 0);
    clock.progress("30", 4, 1000);
    clock.progress("30", 8, 2000);
    clock.progress("30", 2, 2500);
    clock.progress("30", 8, 4000);
    const [ad] = clock.finish(4000);
    expect(ad).toMatchObject({ label: "ADetailer", steps: 16, ms: 3000 });
  });

  it("reports a running segment before it finishes", () => {
    const clock = new RunClock(segments, 0);
    clock.executing("3", 0);
    clock.progress("3", 4, 2000);
    expect(clock.timings(2000)[0]).toMatchObject({ label: "Sampling", steps: 4, ms: 2000 });
  });
});
