import { describe, expect, it } from "vitest";
import { interruptedFolder, originOf, outputPrefix, workflowFolder } from "./gallery.ts";

describe("output folders", () => {
  it("names a workflow's folder, keeping clear of the import and type folders", () => {
    expect(workflowFolder("Illustrious XL", "illustrious")).toBe("illustrious-xl");
    expect(workflowFolder("???", "my-flow")).toBe("my-flow");
    expect(workflowFolder("Civitai", "x")).toBe("civitai-workflow");
    expect(workflowFolder("Grids", "x")).toBe("grids-workflow");
  });
  it("makes ComfyUI's prefix and the stopped run's folder", () => {
    expect(outputPrefix("illustrious", "images")).toBe(
      "illustrious/images/%year%-%month%-%day%/blombo",
    );
    expect(interruptedFolder("illustrious/images/2026-11-01")).toBe(
      "illustrious/interrupted/2026-11-01",
    );
    expect(interruptedFolder("2026-11-01")).toBeNull();
    expect(interruptedFolder("illustrious/grids/2026-11-01")).toBeNull();
  });
  it("reads an image's origin from its path", () => {
    expect(originOf("civitai/abc.jpeg")).toBe("civitai");
    expect(originOf("Imported/a.png")).toBe("imported");
    expect(originOf("illustrious/images/2026-11-01/blombo_00001_.png")).toBe("generated");
    expect(originOf("civitai.png")).toBe("generated");
  });
});
