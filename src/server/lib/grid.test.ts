import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeGrid, wrapLabel } from "./grid.ts";

const solid = (r: number, g: number, b: number, w = 64, h = 96) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();

describe("composeGrid", () => {
  it("lays cells out row by row under their labels, with a gray cell for a missing image", async () => {
    const images = [await solid(255, 0, 0), await solid(0, 255, 0), await solid(0, 0, 255), null];
    const out = await composeGrid({
      images,
      cols: 2,
      rows: 2,
      colLabels: ["CFG scale: 5", "CFG scale: 7"],
      rowLabels: ["Steps: 20", "Steps: 30"],
      title: "XY plot · CFG scale × Steps",
    });
    const meta = await sharp(out.png).metadata();
    expect([meta.width, meta.height]).toEqual([out.width, out.height]);
    // Cells keep the images' 2:3 shape.
    const raw = await sharp(out.png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    // Bottom-right cell is the gray "no image" cell; bottom-left is blue.
    expect(px(out.width - 4, out.height - 4)).toEqual([0xe9, 0xe9, 0xec]);
    const blue = px(Math.round(out.width * 0.45), out.height - 4);
    expect(blue).toEqual([0, 0, 255]);
  });

  it("works without row labels or a title", async () => {
    const out = await composeGrid({
      images: [await solid(10, 10, 10, 32, 32), await solid(200, 200, 200, 32, 32)],
      cols: 2,
      rows: 1,
      colLabels: ["a", "b"],
      rowLabels: [],
    });
    expect(out.width).toBeGreaterThan(out.height);
  });
});

describe("wrapLabel", () => {
  it("wraps by words and cuts what doesn't fit", () => {
    expect(wrapLabel("Sampler: euler ancestral", 12, 3)).toEqual([
      "Sampler:",
      "euler",
      "ancestral",
    ]);
    expect(wrapLabel("one two three four", 8, 2)).toEqual(["one two", "three…"]);
    expect(wrapLabel("supercalifragilistic", 8, 2)).toEqual(["superca…"]);
  });
});
