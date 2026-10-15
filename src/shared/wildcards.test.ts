import { describe, expect, it } from "vitest";
import {
  flattenYamlWildcards,
  txtWildcardName,
  WildcardPath,
  wildcardFormat,
} from "./wildcards.ts";

describe("flattenYamlWildcards", () => {
  it("turns nested keys into reference names", () => {
    const map = flattenYamlWildcards({
      outfits: { fantasy: ["cloak", "armor", "# comment", ""], modern: "hoodie" },
      colors: ["red", 3],
    });
    expect(Object.fromEntries(map)).toEqual({
      "outfits/fantasy": ["cloak", "armor"],
      "outfits/modern": ["hoodie"],
      colors: ["red", "3"],
    });
  });

  it("ignores empty documents", () => {
    expect(flattenYamlWildcards(null).size).toBe(0);
    expect(flattenYamlWildcards("just text").size).toBe(0);
  });
});

describe("wildcard paths", () => {
  it("normalizes separators and refuses escapes", () => {
    expect(WildcardPath.parse("outfits\\fantasy.txt")).toBe("outfits/fantasy.txt");
    expect(WildcardPath.safeParse("../secret.txt").success).toBe(false);
    expect(WildcardPath.safeParse("a//b.txt").success).toBe(false);
    expect(WildcardPath.safeParse("C:/x.txt").success).toBe(false);
  });

  it("knows formats and names", () => {
    expect(wildcardFormat("a/B.YML")).toBe("yaml");
    expect(wildcardFormat("a.md")).toBeNull();
    expect(txtWildcardName("places/forest.txt")).toBe("places/forest");
  });
});
