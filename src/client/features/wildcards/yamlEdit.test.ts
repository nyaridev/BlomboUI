import { describe, expect, it } from "vitest";
import {
  addItem,
  addSection,
  convertKey,
  liftKey,
  moveListItem,
  readSections,
  referenceOf,
  removeItem,
  removeKey,
  renameKey,
  setItem,
  uniqueKey,
} from "./yamlEdit";

const FILE = `# outfits for the fantasy pack
outfits:
  fantasy: # knights and mages
    - armor
    - robe
  modern: [jeans, suit]
colors:
  - red
  - 1
empty:
note: one value
`;

describe("readSections", () => {
  it("reads groups, lists, empty keys and single values in order", () => {
    const r = readSections(FILE);
    expect(r.error).toBeNull();
    const s = r.sections ?? [];
    expect(s.map((x) => [x.key, x.value.kind])).toEqual([
      ["outfits", "group"],
      ["colors", "list"],
      ["empty", "empty"],
      ["note", "other"],
    ]);
    const outfits = s[0]?.value;
    expect(outfits?.kind === "group" && outfits.children[0]?.path).toEqual([0, 0]);
    expect(s[1]?.value).toEqual({ kind: "list", items: ["red", "1"] });
    expect(referenceOf(s, [0, 1])).toBe("outfits/modern");
  });

  it("treats an empty file as no sections and a top-level list as an error", () => {
    expect(readSections("")).toEqual({ sections: [], error: null });
    expect(readSections("# just a comment\n")).toEqual({ sections: [], error: null });
    expect(readSections("- a\n- b\n").error).toMatch(/set of keys/);
    expect(readSections("a: [b\n").error).toBeTruthy();
  });
});

describe("edits", () => {
  it("changes one item and keeps comments and the rest of the file", () => {
    const out = setItem(FILE, [0, 0], 1, "cloak");
    expect(out).toContain("# outfits for the fantasy pack");
    expect(out).toContain("# knights and mages");
    expect(out).toContain("- cloak");
    expect(out).toContain("modern: [ jeans, suit ]");
    expect(readSections(out).sections?.[1]?.value).toEqual({ kind: "list", items: ["red", "1"] });
  });

  it("adds, removes and moves items", () => {
    let out = addItem(FILE, [1], 1);
    expect(readSections(out).sections?.[1]?.value).toEqual({
      kind: "list",
      items: ["red", "", "1"],
    });
    out = removeItem(out, [1], 0);
    out = moveListItem(out, [1], 1, 0);
    expect(readSections(out).sections?.[1]?.value).toEqual({ kind: "list", items: ["1", ""] });
    // An empty key becomes a list when a line is added.
    expect(readSections(addItem(FILE, [2])).sections?.[2]?.value).toEqual({
      kind: "list",
      items: [""],
    });
  });

  it("renames keys, numbering a name a sibling has", () => {
    expect(readSections(renameKey(FILE, [1], "hues")).sections?.[1]?.key).toBe("hues");
    expect(readSections(renameKey(FILE, [1], "outfits")).sections?.[1]?.key).toBe("outfits_2");
    expect(renameKey(FILE, [1], "  ")).toBe(FILE);
    expect(uniqueKey(["a", "a_2"], "a")).toBe("a_3");
  });

  it("removes a key, or lifts a group's keys into its place", () => {
    const removed = readSections(removeKey(FILE, [0])).sections ?? [];
    expect(removed.map((s) => s.key)).toEqual(["colors", "empty", "note"]);
    const lifted = readSections(liftKey(FILE, [0])).sections ?? [];
    expect(lifted.map((s) => s.key)).toEqual(["fantasy", "modern", "colors", "empty", "note"]);
    const clash = readSections(liftKey("a:\n  b: [x]\nb: [y]\n", [0])).sections ?? [];
    expect(clash.map((s) => s.key)).toEqual(["b_2", "b"]);
  });

  it("adds wildcards and groups, also to an empty file and inside an empty key", () => {
    const first = addSection("", [], "list");
    expect(first.path).toEqual([0]);
    expect(readSections(first.text).sections?.[0]).toMatchObject({
      key: "wildcard",
      value: { kind: "list", items: [""] },
    });
    const inside = addSection(FILE, [2], "group");
    expect(inside.path).toEqual([2, 0]);
    expect(readSections(inside.text).sections?.[2]?.value.kind).toBe("group");
    const again = addSection(first.text, [], "list");
    expect(readSections(again.text).sections?.[1]?.key).toBe("wildcard_2");
  });

  it("writes groups and lists filled from empty as blocks, not inline", () => {
    const group = addSection("", [], "group");
    const inside = addSection(group.text, group.path, "list");
    const filled = addItem(setItem(inside.text, inside.path, 0, "knight, plate"), inside.path);
    expect(filled).toBe('group:\n  wildcard:\n    - knight, plate\n    - ""\n');
    expect(addItem("a: []\n", [0])).toBe('a:\n  - ""\n');
    // A list written inline on purpose stays inline.
    expect(addItem("a: [x]\n", [0])).toBe('a: [ x, "" ]\n');
  });

  it("turns a single value into a list of its lines", () => {
    expect(readSections(convertKey(FILE, [3], "list")).sections?.[3]?.value).toEqual({
      kind: "list",
      items: ["one value"],
    });
    expect(readSections(convertKey(FILE, [2], "group")).sections?.[2]?.value).toEqual({
      kind: "group",
      children: [],
    });
  });

  it("leaves text that doesn't parse alone", () => {
    expect(setItem("a: [b\n", [0], 0, "x")).toBe("a: [b\n");
  });
});
