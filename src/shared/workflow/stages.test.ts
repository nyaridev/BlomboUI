import { describe, expect, it } from "vitest";
import { readStages } from "./stages.ts";

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

  it("reads nothing as the defaults", () => {
    expect(readStages(undefined).hires.enabled).toBe(false);
    expect(readStages("nope").controlnet.units).toHaveLength(1);
  });
});
