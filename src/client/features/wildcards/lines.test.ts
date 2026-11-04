import { describe, expect, it } from "vitest";
import { fromLines, toLines } from "./lines";

describe("txt line mode", () => {
  it("round-trips lines with a final newline", () => {
    expect(toLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(fromLines(["a", "# c", ""])).toBe("a\n# c\n\n");
    expect(fromLines([])).toBe("");
  });
});
