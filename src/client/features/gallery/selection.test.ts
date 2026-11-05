import { describe, expect, it } from "vitest";
import { clicked } from "./selection";

const order = [10, 11, 12, 13, 14];
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe("clicked", () => {
  it("adds and removes one with Ctrl, or with any click while some are picked", () => {
    const one = clicked(new Set(), null, 12, { shift: false, toggle: true }, order);
    expect(sorted(one)).toEqual([12]);
    expect(sorted(clicked(one, 12, 12, { shift: false, toggle: false }, order))).toEqual([]);
  });

  it("takes the range from the last click with Shift, either way round", () => {
    expect(sorted(clicked(new Set([11]), 11, 13, { shift: true, toggle: false }, order))).toEqual([
      11, 12, 13,
    ]);
    expect(sorted(clicked(new Set([14]), 14, 12, { shift: true, toggle: false }, order))).toEqual([
      12, 13, 14,
    ]);
  });

  it("picks just the one when Shift has nowhere to start", () => {
    expect(sorted(clicked(new Set(), null, 13, { shift: true, toggle: false }, order))).toEqual([
      13,
    ]);
  });
});
