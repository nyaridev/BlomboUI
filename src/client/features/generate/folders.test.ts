import { describe, expect, it } from "vitest";
import { folderTree, inFolder } from "./folders";

describe("folderTree", () => {
  const files = [
    "b.safetensors",
    "styles\\anime\\a.safetensors",
    "styles/z.safetensors",
    "Chars/x.pt",
  ];

  it("nests folders with recursive counts, sorted by name", () => {
    expect(folderTree(files)).toEqual([
      { path: "Chars", name: "Chars", count: 1, children: [] },
      {
        path: "styles",
        name: "styles",
        count: 2,
        children: [{ path: "styles/anime", name: "anime", count: 1, children: [] }],
      },
    ]);
  });

  it("filters by folder, subfolders included", () => {
    expect(files.filter((f) => inFolder(f, "styles"))).toEqual(files.slice(1, 3));
    expect(files.filter((f) => inFolder(f, null))).toEqual(files);
    expect(inFolder("stylesheet/a.pt", "styles")).toBe(false);
  });
});
