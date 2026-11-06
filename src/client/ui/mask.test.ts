import { describe, expect, it } from "vitest";
import { defaultBrush, hasInk, inkToMask, invertInk, maskToInk, toImagePoint } from "./mask";

const px = (...values: number[]) => new Uint8ClampedArray(values);

describe("mask pixels", () => {
  it("turn a saved mask into ink and back", () => {
    const saved = px(255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255);
    const ink = maskToInk(saved.slice());
    expect([...ink]).toEqual([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 128]);
    expect([...inkToMask(ink)]).toEqual([...saved]);
  });

  it("invert, and tell whether anything is painted", () => {
    const ink = px(255, 255, 255, 0, 255, 255, 255, 200);
    expect(hasInk(ink)).toBe(true);
    expect([...invertInk(ink)]).toEqual([255, 255, 255, 255, 255, 255, 255, 55]);
    expect(hasInk(px(9, 9, 9, 0))).toBe(false);
  });

  it("map the pointer into image pixels and pick a brush for the size", () => {
    const rect = { left: 100, top: 50, width: 256, height: 384 };
    expect(toImagePoint(228, 242, rect, 512, 768)).toEqual({ x: 256, y: 384 });
    expect(defaultBrush(512, 768)).toBe(20);
    expect(defaultBrush(64, 64)).toBe(4);
  });
});
