import { describe, expect, it } from "vitest";
import {
  BrowseFilter,
  base64Url,
  browseQuery,
  type CivitaiCard,
  civitaiImageKey,
  civitaiImageVariant,
  civitaiInApp,
  civitaiKind,
  civitaiOriginal,
  civitaiPageUrl,
  compactCount,
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
});

describe("following feed", () => {
  it("keeps valid, unique usernames and asks with the filter's sort, without a creator", () => {
    expect(parseFeedUsers("a_b, x.y,,a_b,bad name,<x>")).toEqual(["a_b", "x.y"]);
    const params = new URLSearchParams(
      feedQuery(
        ["a", "b"],
        BrowseFilter.parse({ username: "c", sort: "Most Liked", tag: "style" }),
      ),
    );
    expect(params.get("users")).toBe("a,b");
    expect(params.get("user")).toBeNull();
    expect(params.get("sort")).toBe("Most Liked");
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

  it("merges by the sort: oldest first, or by a number with the newest breaking ties", () => {
    const card = (id: number, publishedAt: string, downloads: number) =>
      ({ id, publishedAt, downloads }) as CivitaiCard;
    const pages = [
      [card(1, "2026-01-02", 50), card(2, "2026-02-01", 900)],
      [card(3, "2026-03-01", 50)],
    ];
    expect(mergeFeed(pages, "Oldest").map((c) => c.id)).toEqual([1, 2, 3]);
    expect(mergeFeed(pages, "Most Downloaded", (c) => c.downloads).map((c) => c.id)).toEqual([
      2, 3, 1,
    ]);
  });
});

describe("image keys and originals", () => {
  const url = "https://image.civitai.com/acct/dd9b038c-bd15/width=450/1777041.jpeg";
  it("reads the key from any size of an image", () => {
    expect(civitaiImageKey(url)).toBe("dd9b038c-bd15");
    expect(civitaiImageKey(civitaiImageVariant(url, 1280, false))).toBe("dd9b038c-bd15");
    expect(civitaiImageKey("https://image.civitai.com/acct/x/1.jpeg")).toBeNull();
    expect(civitaiImageKey("not a url")).toBeNull();
  });
  it("points at the original file", () => {
    expect(civitaiOriginal(url)).toBe(
      "https://image.civitai.com/acct/dd9b038c-bd15/original=true/1777041.jpeg",
    );
  });
});

describe("Civitai pages", () => {
  it("links a model on a version, or a search", () => {
    expect(civitaiPageUrl("https://civitai.com", { modelId: 5, versionId: 9 })).toBe(
      "https://civitai.com/models/5?modelVersionId=9",
    );
    expect(civitaiPageUrl("https://civitai.red/", { modelId: 5 })).toBe(
      "https://civitai.red/models/5",
    );
    expect(civitaiPageUrl("https://civitai.com", { query: "detail tweaker" })).toBe(
      "https://civitai.com/search/models?query=detail+tweaker",
    );
  });

  it("opens in the app only with a key Civitai accepted", () => {
    const account = { keySet: true, keyHint: "abcd", username: "me", checkedAt: "x", site: "s" };
    expect(civitaiInApp(account)).toBe(true);
    expect(civitaiInApp({ ...account, username: null })).toBe(false);
    expect(civitaiInApp({ ...account, keySet: false })).toBe(false);
    expect(civitaiInApp(undefined)).toBe(false);
  });
});
