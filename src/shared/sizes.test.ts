import { describe, expect, it } from "vitest";
import { inferScaler, orientSize, parseSize, scaleToMegapixels, sizeFromScaler } from "./sizes.ts";

describe("sizes", () => {
  it("scales to megapixels as ComfyUI does, keeping the shape", () => {
    expect(scaleToMegapixels({ w: 720, h: 1280 }, 0.4, 32)).toEqual({ w: 480, h: 864 });
    expect(scaleToMegapixels({ w: 1024, h: 576 }, 0.4, 32)).toEqual({ w: 864, h: 480 });
    expect(scaleToMegapixels({ w: 1024, h: 576 }, 0.56, 32)).toEqual({ w: 1024, h: 576 });
    // A side that lands on a half step rounds to the even step, as Python's round() does.
    expect(scaleToMegapixels({ w: 80, h: 80 }, 6400 / 1048576, 32)).toEqual({ w: 64, h: 64 });
  });

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
