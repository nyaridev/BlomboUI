import { describe, expect, it } from "vitest";
import {
  comfyNameOf,
  normalizeTag,
  pickScope,
  promptTags,
  ScopesFile,
  scopeKey,
  withDefaultScope,
} from "./scopes.ts";

const scopes = [
  { id: "anime", name: "Anime", group: "Styles", tags: ["anime", "1girl", "cel shading"] },
  { id: "photo", name: "Photo", group: "Styles", tags: ["photorealistic", "dslr", "1girl"] },
];

describe("scopes", () => {
  it("normalizes prompt tags", () => {
    expect(normalizeTag("(Long_Hair:1.2)")).toBe("long hair");
    expect(normalizeTag("[[cel shading]]")).toBe("cel shading");
    expect(normalizeTag("name \\(artist\\)")).toBe("name (artist)");
    expect([...promptTags("anime, <lora:x:1>, BREAK (1girl:1.1)\nsmile")]).toEqual([
      "anime",
      "1girl",
      "smile",
    ]);
  });

  it("picks the scope with the most matching tags, first listed on a tie", () => {
    expect(pickScope("1girl, anime, cel_shading", scopes)).toEqual({
      id: "anime",
      matched: ["anime", "1girl", "cel shading"],
    });
    expect(pickScope("(photorealistic:1.2), 1girl, dslr", scopes)?.id).toBe("photo");
    expect(pickScope("1girl, smile", scopes)?.id).toBe("anime");
    expect(pickScope("a castle", scopes)).toBeNull();
    expect(pickScope("", scopes)).toBeNull();
  });

  it("keys pictures by kind and ComfyUI name", () => {
    expect(comfyNameOf({ folder: "style", file: "a.safetensors" })).toBe("style/a.safetensors");
    expect(comfyNameOf({ folder: "", file: "a.safetensors" })).toBe("a.safetensors");
    expect(scopeKey("loras", "style\\a.safetensors")).toBe("loras/style/a.safetensors");
  });

  it("always has the default scope first", () => {
    expect(withDefaultScope(scopes).map((s) => s.id)).toEqual(["default", "anime", "photo"]);
    const file = ScopesFile.parse({});
    expect(file).toMatchObject({ active: "default", auto: false, scopes: [] });
  });
});
