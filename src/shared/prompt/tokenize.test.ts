import { describe, expect, it } from "vitest";
import { estimateTokens, tokenizePrompt } from "./tokenize.ts";

const types = (text: string) =>
  tokenizePrompt(text).map((t) => `${t.type}:${text.slice(t.from, t.to)}`);

describe("tokenizePrompt", () => {
  it("finds weights inside parens", () => {
    expect(types("(silver hair:1.2)")).toEqual(["paren:(", "weight::1.2", "paren:)"]);
  });

  it("tracks nesting depth", () => {
    const parens = tokenizePrompt("((a))").filter((t) => t.type === "paren");
    expect(parens.map((t) => t.depth)).toEqual([1, 2, 2, 1]);
  });

  it("parses LoRA tags with and without strength", () => {
    expect(types("<lora:detail:0.8>")).toEqual([
      "lora:<lora:detail:0.8>",
      "lora-name:detail",
      "lora-strength:0.8",
    ]);
    expect(types("<lora:detail>")).toEqual(["lora:<lora:detail>", "lora-name:detail"]);
  });

  it("flags broken LoRA tags", () => {
    expect(types("<lora::1>")[0]).toBe("invalid:<lora::1>");
    expect(types("x <lora:oops")[0]).toBe("invalid:<lora:oops");
    expect(types("<lora:a:abc>")[0]).toBe("invalid:<lora:a:abc>");
  });

  it("finds wildcards and BREAK", () => {
    expect(types("__outfits/fantasy__ BREAK x")).toEqual([
      "wildcard:__outfits/fantasy__",
      "break:BREAK",
    ]);
  });

  it("treats escaped brackets as literals", () => {
    expect(types("\\(cinematic\\)")).toEqual(["escape:\\(", "escape:\\)"]);
  });

  it("reads an escaped backslash before a bracket as a real group", () => {
    // a\\(cat): a literal backslash, then the group (cat).
    expect(types("a\\\\(cat)")).toEqual(["escape:\\\\", "paren:(", "paren:)"]);
  });

  it("reports unbalanced brackets", () => {
    expect(types("a) (b")).toEqual(["invalid:)", "invalid:("]);
    expect(types("[a)")).toEqual(["invalid:[", "invalid:)"]);
  });

  it("does not treat brackets inside a LoRA tag as syntax", () => {
    expect(types("<lora:name(v2):1>").some((t) => t.startsWith("paren"))).toBe(false);
  });
});

describe("estimateTokens", () => {
  it("splits chunks at BREAK", () => {
    expect(estimateTokens("a, b BREAK c").chunks).toBe(2);
  });
});
