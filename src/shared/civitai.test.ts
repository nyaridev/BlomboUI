import { describe, expect, it } from "vitest";
import {
  BrowseFilter,
  base64Url,
  browseQuery,
  civitaiImageVariant,
  civitaiKind,
  compactCount,
  fromBase64Url,
  parseBrowseQuery,
} from "./civitai.ts";

describe("civitai helpers", () => {
  it("rewrites image URLs to a width, and videos to a still frame", () => {
    const img =
      "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/f6cad8f1/original=true/144208121.jpeg";
    expect(civitaiImageVariant(img, 450, false)).toBe(
      "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/f6cad8f1/width=450/144208121.jpeg",
    );
    const vid = "https://image.civitai.com/acc/8205d333/original=true/144133557.mp4";
    expect(civitaiImageVariant(vid, 450, true)).toBe(
      "https://image.civitai.com/acc/8205d333/anim=false,transcode=true,width=450,optimized=true/144133557.jpeg",
    );
    expect(civitaiImageVariant("https://image.civitai.com/acc/uuid/1.png", 96, false)).toBe(
      "https://image.civitai.com/acc/uuid/width=96/1.png",
    );
  });

  it("round-trips base64url", () => {
    const url = "https://image.civitai.com/a/b/width=450/ü 1.jpeg?x=1&y=2";
    expect(fromBase64Url(base64Url(url))).toBe(url);
    expect(base64Url(url)).not.toMatch(/[+/=]/);
  });

  it("maps types to folders and counts to short text", () => {
    expect(civitaiKind("LORA")).toBe("loras");
    expect(civitaiKind("LoCon")).toBe("loras");
    expect(civitaiKind("TextualInversion")).toBe("embeddings");
    expect(civitaiKind("Workflows")).toBeNull();
    expect(compactCount(12_400)).toBe("12.4k");
    expect(compactCount(1_234_567)).toBe("1.2M");
    expect(compactCount(999)).toBe("999");
  });
});

describe("browse query", () => {
  it("round-trips a filter and cursor", () => {
    const filter = BrowseFilter.parse({
      query: "detail slider",
      types: ["LORA", "LoCon"],
      baseModels: ["Illustrious", "SDXL 1.0"],
      sort: "Newest",
      period: "Week",
      nsfw: false,
      username: "someone",
    });
    const text = browseQuery(filter, "5482|195397");
    const params = Object.fromEntries(new URLSearchParams(text));
    expect(parseBrowseQuery(params)).toEqual({ filter, cursor: "5482|195397" });
  });

  it("fills defaults and refuses unknown sorts", () => {
    expect(parseBrowseQuery({}).filter).toMatchObject({ sort: "Highest Rated", nsfw: true });
    expect(() => parseBrowseQuery({ sort: "Random" })).toThrow();
  });
});
