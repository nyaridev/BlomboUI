import type { WildcardEntry } from "@shared/wildcards";
import { describe, expect, it } from "vitest";
import { buildTree, folderOf, visibleRows } from "./tree";

const file = (path: string): WildcardEntry => ({
  path,
  type: "file",
  format: "txt",
  size: 1,
  mtime: 1,
});
const folder = (path: string): WildcardEntry => ({
  path,
  type: "folder",
  format: null,
  size: 0,
  mtime: 0,
});

const entries = [
  file("zebra.txt"),
  folder("places"),
  file("places/forest.txt"),
  file("places/city 10.txt"),
  file("places/city 2.txt"),
  file("a.yaml"),
  folder("empty"),
];

describe("wildcard tree", () => {
  it("puts folders first and sorts names naturally", () => {
    const root = buildTree(entries);
    expect(root.children.map((c) => c.name)).toEqual(["empty", "places", "a.yaml", "zebra.txt"]);
    const places = root.children.find((c) => c.name === "places");
    expect(places?.children.map((c) => c.name)).toEqual([
      "city 2.txt",
      "city 10.txt",
      "forest.txt",
    ]);
  });

  it("hides collapsed folders' files, and search opens matches", () => {
    const root = buildTree(entries);
    expect(visibleRows(root, new Set(), "").map((r) => r.node.path)).toEqual([
      "empty",
      "places",
      "a.yaml",
      "zebra.txt",
    ]);
    expect(
      visibleRows(root, new Set(["places"]), "").map((r) => `${r.depth}:${r.node.name}`),
    ).toContain("1:forest.txt");
    expect(visibleRows(root, new Set(), "fore").map((r) => r.node.path)).toEqual([
      "places",
      "places/forest.txt",
    ]);
  });

  it("knows where new files go", () => {
    expect(folderOf("places/forest.txt", "file")).toBe("places");
    expect(folderOf("places", "folder")).toBe("places");
    expect(folderOf(null, null)).toBe("");
  });
});
