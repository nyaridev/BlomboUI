import { describe, expect, it } from "vitest";
import { inferScaler, orientSize, parseSize, sizeFromScaler } from "./sizes.ts";

describe("sizes", () => {
  it("parses and snaps sizes", () => {
    expect(parseSize("1216x832")).toEqual({ w: 1216, h: 832 });
    expect(parseSize(" 1000 × 30 ")).toEqual({ w: 1000, h: 64 });
    expect(parseSize("big")).toBeNull();
  });

  it("turns sizes horizontal or vertical, squares stay", () => {
    expect(orientSize({ w: 832, h: 1216 }, false)).toEqual({ w: 1216, h: 832 });
    expect(orientSize({ w: 1216, h: 832 }, true)).toEqual({ w: 832, h: 1216 });
    expect(orientSize({ w: 1024, h: 1024 }, true)).toEqual({ w: 1024, h: 1024 });
  });

  it("round-trips the scaler", () => {
    const size = sizeFromScaler("2:3", 1);
    expect((size.w % 8) + (size.h % 8)).toBe(0);
    expect(inferScaler(size)).toEqual({ aspect: "2:3", megapixels: 1 });
    expect(inferScaler({ w: 1344, h: 768 }).aspect).toBe("16:9");
    expect(inferScaler({ w: 64, h: 64 }).megapixels).toBe(0.2);
  });
});
