import { describe, expect, it } from "vitest";
import {
  BrowseFilter,
  base64Url,
  browseQuery,
  type CivitaiCard,
  civitaiImageVariant,
  civitaiKind,
  compactCount,
  completeDateRange,
  dateRangeProblem,
  feedQuery,
  fromBase64Url,
  mergeFeed,
  parseBrowseQuery,
  parseFeedUsers,
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
      username: "someone",
      tag: "base model",
      publishedFrom: "2026-09-01",
      publishedTo: "2026-09-30",
    });
    const text = browseQuery(filter, "5482|195397");
    const params = Object.fromEntries(new URLSearchParams(text));
    expect(parseBrowseQuery(params)).toEqual({ filter, cursor: "5482|195397" });
  });

  it("fills defaults and refuses unknown sorts", () => {
    expect(parseBrowseQuery({}).filter).toMatchObject({ sort: "Highest Rated", period: "AllTime" });
    expect(() => parseBrowseQuery({ sort: "Random" })).toThrow();
  });
});

describe("published-date range", () => {
  it("needs both days, in order, 31 days at most", () => {
    expect(dateRangeProblem("", "")).toBeNull();
    expect(dateRangeProblem("2026-09-01", "2026-10-01")).toBeNull();
    expect(dateRangeProblem("2026-09-01", "")).toMatch(/both dates/);
    expect(dateRangeProblem("2026-09-10", "2026-09-01")).toMatch(/after the end/);
    expect(dateRangeProblem("2026-09-01", "2026-10-02")).toMatch(/31 days/);
  });

  it("moves the other end to fit, as Civitai's menu does", () => {
    expect(completeDateRange("2026-09-01", "", "from")).toEqual({
      from: "2026-09-01",
      to: "2026-10-01",
    });
    expect(completeDateRange("", "2026-03-01", "to")).toEqual({
      from: "2026-01-30",
      to: "2026-03-01",
    });
    expect(completeDateRange("2026-09-20", "2026-09-10", "from")).toEqual({
      from: "2026-09-20",
      to: "2026-10-20",
    });
    expect(completeDateRange("2026-09-01", "2026-09-05", "to")).toEqual({
      from: "2026-09-01",
      to: "2026-09-05",
    });
    expect(completeDateRange("2026-09-01", "", "to")).toEqual({ from: "", to: "" });
  });
});

describe("following feed", () => {
  it("keeps valid, unique usernames and asks for the newest without a creator", () => {
    expect(parseFeedUsers("a_b, x.y,,a_b,bad name,<x>")).toEqual(["a_b", "x.y"]);
    const params = new URLSearchParams(
      feedQuery(
        ["a", "b"],
        BrowseFilter.parse({ username: "c", sort: "Most Liked", tag: "style" }),
      ),
    );
    expect(params.get("users")).toBe("a,b");
    expect(params.get("user")).toBeNull();
    expect(params.get("sort")).toBe("Newest");
    expect(params.get("tag")).toBe("style");
  });

  it("merges pages newest first, one card per model", () => {
    const card = (id: number, publishedAt: string | null) => ({ id, publishedAt }) as CivitaiCard;
    const merged = mergeFeed([
      [card(1, "2026-01-02"), card(2, null)],
      [card(3, "2026-03-01"), card(1, "2026-01-02")],
    ]);
    expect(merged.map((c) => c.id)).toEqual([3, 1, 2]);
  });
});
