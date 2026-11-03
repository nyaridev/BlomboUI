import { describe, expect, it } from "vitest";
import {
  findLoraTags,
  formatLoraTag,
  moveLoraTag,
  removeLoraTag,
  setLoraStrength,
  stripLoraTags,
} from "./loras.ts";

describe("findLoraTags", () => {
  it("reads names, strengths and optional CLIP strength", () => {
    const tags = findLoraTags("a <lora:detail:0.8>, b <lora:style> <lora:x:1:0.5>");
    expect(tags.map((t) => [t.name, t.strength, t.clipStrength])).toEqual([
      ["detail", 0.8, null],
      ["style", 1, null],
      ["x", 1, 0.5],
    ]);
  });

  it("skips malformed tags", () => {
    expect(findLoraTags("<lora::1> <lora:a:abc> <lora:b")).toEqual([]);
  });

  it("keeps folders and spaces in names", () => {
    expect(findLoraTags("<lora:SDXL/Detail Slider:0.5>")[0]?.name).toBe("SDXL/Detail Slider");
  });
});

describe("editing tags", () => {
  it("rewrites a strength in place", () => {
    const text = "cat, <lora:detail:0.8>, dog";
    const [tag] = findLoraTags(text);
    expect(setLoraStrength(text, tag!, 0.55)).toBe("cat, <lora:detail:0.55>, dog");
  });

  it("removes a tag with its separator", () => {
    const text = "cat, <lora:detail:0.8>, dog";
    const [tag] = findLoraTags(text);
    expect(removeLoraTag(text, tag!)).toBe("cat, dog");
  });

  it("formats without trailing zeros", () => {
    expect(formatLoraTag("a", 0.8)).toBe("<lora:a:0.8>");
    expect(formatLoraTag("a", 1, 0.25)).toBe("<lora:a:1:0.25>");
  });
});

describe("stripLoraTags", () => {
  it("removes tags and tidies commas", () => {
    expect(stripLoraTags("<lora:a:1>, cat, <lora:b:0.5>, dog, <lora:c>")).toBe("cat, dog");
    expect(stripLoraTags("cat\n<lora:a>, dog")).toBe("cat\ndog");
  });
});

describe("moveLoraTag", () => {
  it("reorders tags in the slots they fill, keeping the text around them", () => {
    const text = "cat, <lora:a:0.5>, dog <lora:b>\n<lora:c:1:0.2> end";
    expect(moveLoraTag(text, 0, 2)).toBe("cat, <lora:b>, dog <lora:c:1:0.2>\n<lora:a:0.5> end");
    expect(moveLoraTag(text, 2, 0)).toBe("cat, <lora:c:1:0.2>, dog <lora:a:0.5>\n<lora:b> end");
    expect(moveLoraTag(text, 1, 1)).toBe(text);
    expect(moveLoraTag(text, 0, 5)).toBe(text);
  });
});
