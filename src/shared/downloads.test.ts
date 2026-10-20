import { describe, expect, it } from "vitest";
import {
  categoryOf,
  cleanFolder,
  kindFolder,
  type PlanInput,
  parseSize,
  planFileName,
  planFolder,
  safeSegment,
} from "./downloads.ts";

const input: PlanInput = {
  fileName: "Detail_Tweaker.SafeTensors",
  modelName: "Detail Tweaker: XL",
  versionName: "v2.0",
  baseModel: "Illustrious",
  creator: "some_user_123",
  tags: ["tool", "Character", "detail"],
};

describe("download destinations", () => {
  it("sorts into base model, category and creator folders", () => {
    expect(planFolder(input, ["baseModel"], [])).toBe("Illustrious");
    expect(planFolder(input, ["baseModel", "category", "creator"], [])).toBe(
      "Illustrious/Character/some_user_123",
    );
    expect(planFolder(input, ["creator"], [{ from: "SOME_USER_123", to: "Some User" }])).toBe(
      "Some User",
    );
    expect(planFolder(input, [], [])).toBe("");
  });

  it("skips parts a model doesn't have", () => {
    expect(planFolder({ ...input, baseModel: null, tags: [] }, ["baseModel", "category"], [])).toBe(
      "",
    );
  });

  it("names files from Civitai or from the model", () => {
    expect(planFileName(input, "original")).toBe("Detail_Tweaker.safetensors");
    expect(planFileName(input, "model")).toBe("Detail Tweaker XL.safetensors");
    expect(planFileName(input, "model-version")).toBe("Detail Tweaker XL - v2.0.safetensors");
  });

  it("makes names Windows accepts", () => {
    expect(safeSegment('  a<b>:"c"|d?*.  ')).toBe("a b c d");
    expect(safeSegment("Flux.1 D")).toBe("Flux.1 D");
    expect(safeSegment("CON")).toBe("CON_");
    expect(safeSegment("...")).toBe("");
    expect(cleanFolder("a\\b/../c/./  d ")).toBe("a/b/c/d");
  });

  it("finds categories and kind folders", () => {
    expect(categoryOf(["Style", "character"])).toBe("Character");
    expect(categoryOf(["anime"])).toBeNull();
    expect(kindFolder("diffusion_models")).toBe("diffusion_models");
    expect(kindFolder("text_encoders")).toBe("text_encoders");
  });

  it("parses catalog sizes", () => {
    expect(parseSize("4.71MB")).toBe(Math.round(4.71 * 1024 ** 2));
    expect(parseSize("2.04GB")).toBe(Math.round(2.04 * 1024 ** 3));
    expect(parseSize("25KB")).toBe(25 * 1024);
    expect(parseSize("big")).toBeNull();
  });
});

describe("planFileName with odd remote names", () => {
  const input = {
    fileName: "",
    modelName: "Detail",
    versionName: "v1",
    baseModel: "SDXL 1.0",
    creator: "someone",
    tags: [],
  };
  it("keeps only a plain extension", () => {
    expect(planFileName({ ...input, fileName: "m.st:hidden" }, "original")).not.toContain(":");
    expect(planFileName({ ...input, fileName: "x./../checkpoints/y" }, "original")).not.toContain(
      "/",
    );
    expect(planFileName({ ...input, fileName: "lora.SafeTensors" }, "original")).toBe(
      "lora.safetensors",
    );
  });
});
