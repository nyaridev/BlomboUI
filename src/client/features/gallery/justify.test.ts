import { describe, expect, it } from "vitest";
import { justify } from "./justify";

describe("justify", () => {
  it("fills full rows to the container width", () => {
    const rows = justify([1, 1, 1, 1, 1], (r) => r, 1000, 300, 10);
    const first = rows[0] ?? [];
    const width = first.reduce((a, c) => a + c.width, 0) + 10 * (first.length - 1);
    expect(Math.round(width)).toBe(1000);
  });

  it("keeps the last row at or below the target height", () => {
    const rows = justify([1, 0.5], (r) => r, 1000, 200, 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[0]?.height).toBe(200);
  });

  it("returns nothing for a zero-width container", () => {
    expect(justify([1, 2], (r) => r, 0, 200, 8)).toEqual([]);
  });
});
