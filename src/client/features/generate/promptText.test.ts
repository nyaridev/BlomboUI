import { describe, expect, it } from "vitest";
import { appendToPrompt, joinAtCursor } from "./promptText";

describe("joinAtCursor", () => {
  it("keeps tags comma separated around the cursor", () => {
    expect(joinAtCursor("", "masterpiece", "")).toBe("masterpiece");
    expect(joinAtCursor("a cat", "best quality", "")).toBe(", best quality");
    expect(joinAtCursor("a cat,", "smile", "")).toBe(" smile");
    expect(joinAtCursor("a cat, ", "smile", "")).toBe("smile");
    expect(joinAtCursor("", "smile", " outdoors")).toBe("smile, ");
    expect(joinAtCursor("a, ", ", smile,", ", b")).toBe("smile");
    expect(joinAtCursor("a", "  ", "b")).toBe("");
  });

  it("appends to a prompt", () => {
    expect(appendToPrompt("a cat", "smile")).toBe("a cat, smile");
    expect(appendToPrompt("", "smile")).toBe("smile");
  });
});
