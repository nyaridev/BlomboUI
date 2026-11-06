import { describe, expect, it } from "vitest";
import { FIT, MAX_ZOOM, zoomAt } from "./zoomPan";

describe("zoomAt", () => {
  it("zooms in around the pointer, keeping that point still", () => {
    const v = zoomAt(FIT, -347, 100, 50); // exp(0.694) ≈ 2×
    expect(v.scale).toBeCloseTo(2, 2);
    // The point 100, 50 from the center stays under the pointer: (100 - x) / scale = 100.
    expect((100 - v.x) / v.scale).toBeCloseTo(100, 5);
    expect((50 - v.y) / v.scale).toBeCloseTo(50, 5);
  });

  it("stops at 8× and snaps back to fit at 1×", () => {
    expect(zoomAt({ scale: 7, x: 0, y: 0 }, -5000, 0, 0).scale).toBe(MAX_ZOOM);
    expect(zoomAt({ scale: 1.2, x: 30, y: -10 }, 5000, 0, 0)).toEqual(FIT);
  });
});
