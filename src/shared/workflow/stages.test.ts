import { describe, expect, it } from "vitest";
import { readStages, stageImageFiles } from "./stages.ts";

describe("readStages", () => {
  it("keeps a stage on when one value is out of range (unlinked from a bigger base)", () => {
    const s = readStages({ hires: { enabled: true, steps: 200, scale: 2 } });
    expect(s.hires.enabled).toBe(true);
    expect(s.hires.steps).toBe(150);
    expect(s.hires.scale).toBe(2);
  });

  it("drops only the broken unit", () => {
    const s = readStages({
      adetailer: {
        enabled: true,
        units: [
          { id: "face", name: "Face" },
          { id: "hands", name: "" },
          { id: "eyes", name: "Eyes" },
        ],
      },
    });
    expect(s.adetailer.enabled).toBe(true);
    expect(s.adetailer.units.map((u) => u.id)).toEqual(["face", "eyes"]);
  });

  it("reads a first pass saved before the video modes, and keeps a broken last frame out", () => {
    const image = {
      file: "0123456789abcdef.png",
      source: "upload",
      label: "a.png",
      width: 512,
      height: 512,
    };
    const old = readStages({ source: { mode: "img2img", image, denoise: 0.5 } });
    expect(old.source).toMatchObject({ mode: "img2img", image, last: null, denoise: 0.5 });
    const video = readStages({ source: { mode: "firstLast", image, last: { file: 3 } } });
    expect(video.source).toMatchObject({ mode: "firstLast", image, last: null });
  });

  it("lists the frames and masks a run sends, only for the mode that uses them", () => {
    const pic = (n: number) => ({
      file: `${String(n).repeat(16)}.png`,
      source: "upload",
      label: "a.png",
      width: 8,
      height: 8,
    });
    const files = (source: object) => stageImageFiles(readStages({ source }));
    expect(files({ mode: "firstLast", image: pic(1), last: pic(2) })).toEqual([
      pic(1).file,
      pic(2).file,
    ]);
    expect(files({ mode: "first", image: pic(1), last: pic(2) })).toEqual([pic(1).file]);
    expect(files({ mode: "inpaint", image: pic(1), mask: pic(3) })).toEqual([
      pic(1).file,
      pic(3).file,
    ]);
    expect(files({ mode: "txt2img", image: pic(1) })).toEqual([]);
  });

  it("reads nothing as the defaults", () => {
    expect(readStages(undefined).hires.enabled).toBe(false);
    expect(readStages("nope").controlnet.units).toHaveLength(1);
  });
});
