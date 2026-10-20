import { describe, expect, it } from "vitest";
import { explainPrompt } from "./explain.ts";
import { tokenizePrompt } from "./tokenize.ts";

describe("explainPrompt", () => {
  it("works out each tag's weight", () => {
    const { chunks } = explainPrompt(
      "plain, (soft:1.5), ((double)), [less], ([mixed]), (a, b:0.8)",
    );
    expect(chunks[0]?.tags).toEqual([
      { text: "plain", weight: 1 },
      { text: "soft", weight: 1.5 },
      { text: "double", weight: 1.21 },
      { text: "less", weight: 0.909 },
      { text: "mixed", weight: 1 },
      { text: "a", weight: 0.8 },
      { text: "b", weight: 0.8 },
    ]);
  });

  it("keeps the weights after a zero-weight group", () => {
    const { chunks } = explainPrompt("(a:0), b, (c:1.2)");
    expect(chunks[0]?.tags).toEqual([
      { text: "a", weight: 0 },
      { text: "b", weight: 1 },
      { text: "c", weight: 1.2 },
    ]);
  });

  it("keeps escaped parentheses as text", () => {
    const { chunks } = explainPrompt("name \\(artist\\), (cat:1.2)");
    expect(chunks[0]?.tags).toEqual([
      { text: "name (artist)", weight: 1 },
      { text: "cat", weight: 1.2 },
    ]);
  });

  it("lists LoRAs, wildcards and choices, and splits at BREAK", () => {
    const e = explainPrompt("a __animal__ in {red|blue} light, <lora:detail:0.6> BREAK sunset");
    expect(e.loras).toEqual([{ name: "detail", strength: 0.6 }]);
    expect(e.wildcards).toEqual(["animal"]);
    expect(e.choices).toEqual([["red", "blue"]]);
    expect(e.chunks).toHaveLength(2);
    expect(e.chunks[0]?.tags.map((t) => t.text)).toEqual(["a __animal__ in {red|blue} light"]);
    expect(e.chunks[1]?.tags).toEqual([{ text: "sunset", weight: 1 }]);
    expect(e.issues).toEqual([]);
  });

  it("reports syntax problems", () => {
    expect(explainPrompt("(oops, <lora:>").issues).toEqual([
      '"(" is never closed',
      "LoRA tag has no name",
    ]);
  });
});

describe("tokenizer choices", () => {
  it("marks the braces and bars of {a|b} and keeps the syntax inside", () => {
    const tokens = tokenizePrompt("{(red:1.2)|blue}");
    expect(tokens.filter((t) => t.type === "choice").map((t) => t.from)).toEqual([0, 10, 15]);
    expect(tokens.some((t) => t.type === "weight")).toBe(true);
  });
});
