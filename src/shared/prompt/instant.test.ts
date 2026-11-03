import { describe, expect, it } from "vitest";
import { readInstantLoras, withTriggers } from "./instant.ts";

describe("readInstantLoras", () => {
  it("keeps valid entries and drops broken ones", () => {
    expect(
      readInstantLoras([
        { name: "style/ink", strength: 0.8 },
        { name: "", strength: 1 },
        { name: "detail" },
        "x",
      ]),
    ).toEqual([{ name: "style/ink", strength: 0.8 }]);
    expect(readInstantLoras(undefined)).toEqual([]);
  });
});

describe("withTriggers", () => {
  it("puts words at the start and the end", () => {
    expect(withTriggers("a cat, sitting", ["ink style"], ["lineart, mono"])).toBe(
      "ink style, a cat, sitting, lineart, mono",
    );
  });
  it("skips empty parts and stray commas", () => {
    expect(withTriggers("a cat,", [], [""])).toBe("a cat");
    expect(withTriggers("", ["ink"], [])).toBe("ink");
    expect(withTriggers("a cat", [], [])).toBe("a cat");
  });
});
