import { describe, expect, it } from "vitest";
import { groupBaseModels } from "./basemodels.ts";

describe("groupBaseModels", () => {
  it("orders by group, keeps the names given and puts unknown ones under Other", () => {
    expect(groupBaseModels(["SDXL 1.0", "Mystery", "illustrious", "Flux.1 D", "SDXL 1.0"])).toEqual(
      [
        { name: "illustrious", label: "Illustrious", group: "SDXL Community" },
        { name: "SDXL 1.0", label: "SDXL 1.0", group: "Stability AI · SDXL" },
        { name: "Flux.1 D", label: "Flux.1 D", group: "Black Forest Labs" },
        { name: "Mystery", label: "Mystery", group: "Other" },
      ],
    );
  });

  it("puts names it doesn't list into the family they belong to, after its own", () => {
    expect(groupBaseModels(["Wan Video 3.1", "Wan Video 1.3B t2v", "Flux.4", "Brand new"])).toEqual(
      [
        { name: "Flux.4", label: "Flux.4", group: "Black Forest Labs" },
        { name: "Wan Video 1.3B t2v", label: "Wan Video 1.3B t2v", group: "Alibaba · Wan" },
        { name: "Wan Video 3.1", label: "Wan Video 3.1", group: "Alibaba · Wan" },
        { name: "Brand new", label: "Brand new", group: "Other" },
      ],
    );
  });

  it("groups makers as Civitai does", () => {
    expect(groupBaseModels(["MOSS Image", "Muse Image", "MiniMax Music 3"])).toEqual([
      { name: "Muse Image", label: "Muse Image", group: "Meta" },
      { name: "MiniMax Music 3", label: "MiniMax Music 3", group: "MiniMax" },
      { name: "MOSS Image", label: "MOSS Image", group: "OpenMOSS" },
    ]);
  });

  it("reads the short labels local models carry", () => {
    expect(groupBaseModels(["SD1.5", "IL", "Wan Video ", "Flux"])).toEqual([
      { name: "IL", label: "Illustrious", group: "SDXL Community" },
      { name: "SD1.5", label: "SD 1.5", group: "Stability AI · SD 1 and 2" },
      { name: "Flux", label: "Flux", group: "Black Forest Labs" },
      { name: "Wan Video ", label: "Wan Video…", group: "Alibaba · Wan" },
    ]);
  });
});
