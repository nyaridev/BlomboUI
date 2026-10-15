import { describe, expect, it } from "vitest";
import { rng } from "../random.ts";
import { expandPrompt, findWildcards, wildcardLines } from "./wildcards.ts";

const files: Record<string, string[]> = {
  color: ["red", "blue", "green"],
  "outfits/fantasy": ["__color__ cloak", "silver armor"],
  loop: ["again __loop__"],
};
const resolve = (name: string) => files[name];

describe("expandPrompt", () => {
  it("is deterministic for a seed", () => {
    const a = expandPrompt("1girl, __outfits/fantasy__, {day|night}", rng(42), resolve);
    const b = expandPrompt("1girl, __outfits/fantasy__, {day|night}", rng(42), resolve);
    expect(a.text).toBe(b.text);
    expect(a.text).not.toContain("__");
    expect(a.text).not.toContain("{");
  });

  it("expands nested wildcards and reports what it used", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const r = expandPrompt("__outfits/fantasy__", rng(seed), resolve);
      seen.add(r.text);
      expect(r.missing).toEqual([]);
    }
    expect(seen).toContain("silver armor");
    expect([...seen].some((t) => /^(red|blue|green) cloak$/.test(t))).toBe(true);
  });

  it("leaves unknown wildcards and lists them", () => {
    const r = expandPrompt("a __nope__ b", rng(1), resolve);
    expect(r.text).toBe("a __nope__ b");
    expect(r.missing).toEqual(["nope"]);
  });

  it("stops self-referencing wildcards at the depth limit", () => {
    const r = expandPrompt("__loop__", rng(1), resolve, 4);
    expect(r.text.startsWith("again again again again")).toBe(true);
  });

  it("leaves braces without options alone", () => {
    expect(expandPrompt("{not a choice}", rng(1), resolve).text).toBe("{not a choice}");
  });
});

describe("helpers", () => {
  it("drops blanks and comments from wildcard files", () => {
    expect(wildcardLines("# colors\r\nred\n\n  blue  \n")).toEqual(["red", "blue"]);
  });

  it("finds wildcard names once each", () => {
    expect(findWildcards("__a__ __b/c__ __a__")).toEqual(["a", "b/c"]);
  });
});
