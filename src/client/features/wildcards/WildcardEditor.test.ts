import { describe, expect, it } from "vitest";
import { lintWildcards } from "./WildcardEditor";

describe("lintWildcards", () => {
  it("reports YAML errors with a position", () => {
    const d = lintWildcards("a: [unclosed\nb: 1", "yaml", new Set());
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]?.severity).toBe("error");
  });

  it("warns about references nothing defines, but not in comments", () => {
    const text = "red __colors__\n# __ignored__\nblue __nope__";
    const d = lintWildcards(text, "txt", new Set(["colors"]));
    expect(d).toHaveLength(1);
    expect(d[0]?.message).toMatch(/No wildcard named "nope"/);
    expect(text.slice(d[0]?.from, d[0]?.to)).toBe("__nope__");
  });

  it("is quiet for valid files", () => {
    expect(lintWildcards("outfits:\n  - __colors__\n", "yaml", new Set(["colors"]))).toEqual([]);
  });
});
