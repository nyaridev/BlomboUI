import { describe, expect, it } from "vitest";
import { groupBaseModels } from "./basemodels.ts";

describe("groupBaseModels", () => {
  it("orders by group, keeps the names given and puts unknown ones under Other", () => {
    expect(groupBaseModels(["SDXL 1.0", "Mystery", "illustrious", "Flux.1 D", "SDXL 1.0"])).toEqual(
      [
        { name: "illustrious", label: "Illustrious", group: "Illustrious and NoobAI" },
        { name: "SDXL 1.0", label: "SDXL 1.0", group: "SDXL" },
        { name: "Flux.1 D", label: "Flux.1 D", group: "Flux" },
        { name: "Mystery", label: "Mystery", group: "Other" },
      ],
    );
  });

  it("puts names it doesn't list into the family they belong to, after its own", () => {
    expect(groupBaseModels(["Wan Video 3.1", "Wan Video 1.3B t2v", "Flux.4", "Brand new"])).toEqual(
      [
        { name: "Flux.4", label: "Flux.4", group: "Flux" },
        { name: "Wan Video 1.3B t2v", label: "Wan Video 1.3B t2v", group: "Wan" },
        { name: "Wan Video 3.1", label: "Wan Video 3.1", group: "Wan" },
        { name: "Brand new", label: "Brand new", group: "Other" },
      ],
    );
  });

  it("reads the short labels local models carry", () => {
    expect(groupBaseModels(["SD1.5", "IL", "Wan Video ", "Flux"])).toEqual([
      { name: "IL", label: "Illustrious", group: "Illustrious and NoobAI" },
      { name: "SD1.5", label: "SD 1.5", group: "SD 1 and 2" },
      { name: "Flux", label: "Flux", group: "Flux" },
      { name: "Wan Video ", label: "Wan Video…", group: "Wan" },
    ]);
  });
});
