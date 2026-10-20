import { describe, expect, it } from "vitest";
import {
  completeContext,
  formatTag,
  normalizeTag,
  parseTagCsv,
  promptTags,
  shortCount,
} from "./autocomplete.ts";

describe("parseTagCsv", () => {
  it("reads name, category, count and quoted aliases", () => {
    const rows = parseTagCsv(
      'name,category,count,aliases\n1girl,0,4114588,"1girls,sole_female"\nhatsune_miku,4,1000,\n\nsmile,0',
    );
    expect(rows).toEqual([
      { name: "1girl", category: 0, count: 4114588, aliases: ["1girls", "sole_female"] },
      { name: "hatsune_miku", category: 4, count: 1000, aliases: [] },
      { name: "smile", category: 0, count: 0, aliases: [] },
    ]);
  });

  it("skips duplicates and comments", () => {
    expect(parseTagCsv("# list\na,0,1\nA,0,5").map((r) => r.name)).toEqual(["a"]);
  });
});

describe("promptTags", () => {
  it("strips weights, LoRAs, wildcards and choices", () => {
    expect(
      promptTags(
        "masterpiece, (long hair:1.2), [smile], <lora:detail:0.8>, __outfits__, {red|blue} dress\nBREAK sky",
      ),
    ).toEqual(["masterpiece", "long_hair", "smile", "dress", "sky"]);
  });

  it("keeps escaped parentheses", () => {
    expect(promptTags("name \\(artist\\), (xy:1.1)")).toEqual(["name_(artist)", "xy"]);
  });
});

describe("completeContext", () => {
  it("finds the tag since the last separator", () => {
    expect(completeContext("masterpiece, long ha", 20)).toEqual({
      mode: "tag",
      from: 13,
      query: "long ha",
    });
    expect(completeContext("(smi", 4)).toEqual({ mode: "tag", from: 1, query: "smi" });
  });

  it("finds LoRAs and wildcards", () => {
    expect(completeContext("a, <lora:det", 12)).toEqual({ mode: "lora", from: 3, query: "det" });
    expect(completeContext("a, <", 4)).toEqual({ mode: "lora", from: 3, query: "" });
    expect(completeContext("a, <lo", 6)).toEqual({ mode: "lora", from: 3, query: "" });
    expect(completeContext("a, <det", 7)).toEqual({ mode: "lora", from: 3, query: "det" });
    expect(completeContext("<hypernet:x", 11)).toBeNull();
    expect(completeContext("a, __out", 8)).toEqual({ mode: "wildcard", from: 3, query: "out" });
  });

  it("stays quiet in weights, LoRA strengths and empty space", () => {
    expect(completeContext("(hair:1.", 8)).toBeNull();
    expect(completeContext("<lora:detail:0.", 15)).toBeNull();
    expect(completeContext("a, ", 3)).toBeNull();
  });
});

describe("formatting", () => {
  it("replaces underscores and escapes parentheses", () => {
    const opts = { replaceUnderscores: true, escapeParens: true };
    expect(formatTag("long_hair", opts)).toBe("long hair");
    expect(formatTag("kanji_(artist)", opts)).toBe("kanji \\(artist\\)");
    expect(formatTag("^_^", opts)).toBe("^_^");
    expect(formatTag("long_hair", { replaceUnderscores: false, escapeParens: false })).toBe(
      "long_hair",
    );
  });

  it("normalizes and shortens", () => {
    expect(normalizeTag(" Long Hair ")).toBe("long_hair");
    expect(shortCount(4114588)).toBe("4.1M");
    expect(shortCount(34567)).toBe("35k");
    expect(shortCount(512)).toBe("512");
  });
});
