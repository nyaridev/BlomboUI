import { PreviewSettings } from "@shared/settings";
import { describe, expect, it } from "vitest";
import { previewDue } from "./preview";

const due = (p: Partial<PreviewSettings>, max: number, wait: boolean) => {
  const settings = PreviewSettings.parse(p);
  return Array.from({ length: max }, (_, i) => i + 1).filter((step) =>
    previewDue(step, max, settings, wait),
  );
};

describe("previewDue", () => {
  it("waits for the first multiple of the interval at or after `after`, then every interval", () => {
    expect(due({ every: 4, after: 8 }, 20, true)).toEqual([8, 12, 16, 20]);
    expect(due({ every: 4, after: 10, lastStep: false }, 22, true)).toEqual([12, 16, 20]);
  });

  it("adds the last step when asked, and skips the wait for later runs", () => {
    expect(due({ every: 4, after: 8 }, 22, true)).toEqual([8, 12, 16, 20, 22]);
    expect(due({ every: 4, after: 8, lastStep: false }, 10, false)).toEqual([4, 8]);
  });

  it("shows nothing when previews are off", () => {
    expect(due({ show: false }, 20, false)).toEqual([]);
  });
});
