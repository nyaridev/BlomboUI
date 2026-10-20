import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "./fuzzy";

describe("fuzzy", () => {
  it("matches characters in order", () => {
    expect(fuzzyScore("gnr", "Generate")).not.toBeNull();
    expect(fuzzyScore("xyz", "Generate")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
    // Letters scattered over a long text don't count.
    expect(fuzzyScore("dream", "v1-5-pruned-emaonly.safetensors Models")).toBeNull();
    expect(fuzzyScore("unl mod", "Unload models from VRAM")).not.toBeNull();
  });

  it("ranks prefixes and word starts first", () => {
    const items = ["Settings → Gallery", "Go to Gallery", "Gallery", "Unload models"];
    expect(fuzzyFilter(items, "gal", (s) => s)).toEqual([
      "Gallery",
      "Go to Gallery",
      "Settings → Gallery",
    ]);
    expect(fuzzyFilter(items, "um", (s) => s)).toEqual(["Unload models"]);
  });
});
