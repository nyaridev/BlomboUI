import { describe, expect, it } from "vitest";
import { addYamlList, fromLines, setYamlList, toLines, yamlLists } from "./lines";

describe("txt line mode", () => {
  it("round-trips lines with a final newline", () => {
    expect(toLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(fromLines(["a", "# c", ""])).toBe("a\n# c\n\n");
    expect(fromLines([])).toBe("");
  });
});

describe("yaml line mode", () => {
  const text =
    "# my outfits\noutfits:\n  fantasy: # the good ones\n    - cloak\n    - armor\n  modern: hoodie\n";

  it("lists every key's options", () => {
    expect(yamlLists(text)).toEqual({
      lists: [
        { path: "outfits/fantasy", items: ["cloak", "armor"] },
        { path: "outfits/modern", items: ["hoodie"] },
      ],
      error: null,
    });
    expect(yamlLists("a: [x").error).toBeTruthy();
  });

  it("edits one list and keeps comments", () => {
    const next = setYamlList(text, "outfits/fantasy", ["cloak", "robe"]);
    expect(next).toContain("# my outfits");
    expect(next).toContain("# the good ones");
    expect(yamlLists(next).lists[0]?.items).toEqual(["cloak", "robe"]);
    expect(yamlLists(setYamlList(text, "outfits/modern", ["a", "b"])).lists[1]?.items).toEqual([
      "a",
      "b",
    ]);
  });

  it("adds a new key", () => {
    expect(yamlLists(addYamlList("", "colors/warm")).lists).toEqual([
      { path: "colors/warm", items: [] },
    ]);
    expect(yamlLists(addYamlList(text, "outfits/space")).lists.map((l) => l.path)).toContain(
      "outfits/space",
    );
  });
});
