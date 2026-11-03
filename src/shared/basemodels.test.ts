import { describe, expect, it } from "vitest";
import { groupBaseModels } from "./basemodels.ts";

describe("groupBaseModels", () => {
  it("orders by group, keeps the names given and puts unknown ones under Other", () => {
    expect(groupBaseModels(["SDXL 1.0", "Mystery", "illustrious", "Flux.1 D", "SDXL 1.0"])).toEqual(
      [
        { name: "Flux.1 D", label: "Flux.1 D", group: "Black Forest Labs" },
        { name: "illustrious", label: "Illustrious", group: "SDXL Community" },
        { name: "SDXL 1.0", label: "SDXL 1.0", group: "Stability AI" },
        { name: "Mystery", label: "Mystery", group: "Other" },
      ],
    );
  });

  it("reads the short labels local models carry", () => {
    expect(groupBaseModels(["SD1.5", "IL", "Wan Video ", "Flux"])).toEqual([
      { name: "Flux", label: "Flux", group: "Black Forest Labs" },
      { name: "IL", label: "Illustrious", group: "SDXL Community" },
      { name: "Wan Video ", label: "Wan Video…", group: "Alibaba" },
      { name: "SD1.5", label: "SD 1.5", group: "Stability AI" },
    ]);
  });
});
