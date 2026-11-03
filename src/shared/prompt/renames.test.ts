import { describe, expect, it } from "vitest";
import { renameName, renameRefs } from "./renames.ts";

describe("renames", () => {
  it("renames a LoRA tag only when the whole name matches", () => {
    const c = { kind: "lora", from: "style/Detailer", to: "style/Sharp", folder: false } as const;
    expect(renameRefs("a, <lora:style/Detailer:0.8>, <lora:style/Detailer2:1>", c)).toBe(
      "a, <lora:style/Sharp:0.8>, <lora:style/Detailer2:1>",
    );
    // Written by its file name alone, or with backslashes and an extension.
    expect(renameRefs("<lora:Detailer:1> <lora:style\\Detailer.safetensors>", c)).toBe(
      "<lora:Sharp:1> <lora:style\\Sharp.safetensors>",
    );
  });

  it("renames a folder's part of every name inside it", () => {
    const c = { kind: "lora", from: "style", to: "looks", folder: true } as const;
    expect(renameRefs("<lora:style/a/b:1> <lora:styles/c:1> <lora:style:1>", c)).toBe(
      "<lora:looks/a/b:1> <lora:styles/c:1> <lora:style:1>",
    );
  });

  it("renames full wildcard references, names with underscores included", () => {
    const c = { kind: "wildcard", from: "hair_color", to: "hair", folder: false } as const;
    expect(renameRefs("{__hair_color__|__hair_colors__}, __people/hair_color__", c)).toBe(
      "{__hair__|__hair_colors__}, __people/hair_color__",
    );
    expect(
      renameRefs("__people/actors__ __peoples/x__", {
        kind: "wildcard",
        from: "people",
        to: "persons",
        folder: true,
      }),
    ).toBe("__persons/actors__ __peoples/x__");
  });

  it("keeps a model value's extension and slash style", () => {
    const c = { from: "sd15\\dream.safetensors", to: "sd15/dreamy", folder: false };
    expect(renameName("sd15\\dream.safetensors", c)).toBe("sd15\\dreamy.safetensors");
    expect(renameName("sd15/other.safetensors", c)).toBeNull();
    // Only LoRA tags match by file name alone.
    expect(renameName("dream.safetensors", c)).toBeNull();
    expect(
      renameRefs("__actors__", {
        kind: "wildcard",
        from: "people/actors",
        to: "people/cast",
        folder: false,
      }),
    ).toBe("__actors__");
  });
});
