import { describe, expect, it } from "vitest";
import { nudgeWeight } from "./weight.ts";

/** Run a nudge with the cursor at "|" (or a selection between two "|"). */
function nudge(marked: string, delta: number) {
  const first = marked.indexOf("|");
  const second = marked.indexOf("|", first + 1);
  const text = marked.replace(/\|/g, "");
  const from = first;
  const to = second === -1 ? first : second - 1;
  const out = nudgeWeight(text, from, to, delta);
  return out && { text: out.text, selected: out.text.slice(out.from, out.to) };
}

describe("nudgeWeight", () => {
  it("wraps the tag at the cursor", () => {
    expect(nudge("masterpiece, long ha|ir, smile", 0.05)).toEqual({
      text: "masterpiece, (long hair:1.05), smile",
      selected: "long hair",
    });
    expect(nudge("red |dress", -0.1)?.text).toBe("(red dress:0.9)");
  });

  it("wraps a selection", () => {
    expect(nudge("a |red| dress", 0.1)?.text).toBe("a (red:1.1) dress");
  });

  it("changes an existing weight and unwraps at 1", () => {
    expect(nudge("(long ha|ir:1.2), smile", 0.05)?.text).toBe("(long hair:1.25), smile");
    expect(nudge("(long ha|ir:1.05), smile", -0.05)).toEqual({
      text: "long hair, smile",
      selected: "long hair",
    });
  });

  it("reads a group without a weight as 1.1", () => {
    expect(nudge("(sh|iny)", 0.05)?.text).toBe("(shiny:1.15)");
  });

  it("uses the innermost group and ignores escaped parentheses", () => {
    expect(nudge("((a, b|:0.8), c:1.2)", 0.1)?.text).toBe("((a, b:0.9), c:1.2)");
    expect(nudge("name \\(ar|tist\\)", 0.1)?.text).toBe("(name \\(artist\\):1.1)");
  });

  it("changes a LoRA's model strength and keeps its CLIP strength", () => {
    expect(nudge("x, <lora:det|ail:0.8>", 0.05)?.text).toBe("x, <lora:detail:0.85>");
    expect(nudge("<lora:det|ail>", -0.1)?.text).toBe("<lora:detail:0.9>");
    expect(nudge("<lora:a:1:0|.5>", 0.1)?.text).toBe("<lora:a:1.1:0.5>");
  });

  it("does nothing on empty space", () => {
    expect(nudge("a, |, b", 0.1)).toBeNull();
  });
});
