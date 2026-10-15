import { describe, expect, it } from "vitest";
import { decimalsOf, parseNumberInput, snap } from "./number";

describe("number helpers", () => {
  it("counts step decimals", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(1e-7)).toBe(7);
  });

  it("snaps to the step grid without float noise", () => {
    expect(snap(0.1 + 0.2, 0.1, 0, 1)).toBe(0.3);
    expect(snap(7.26, 0.5, 1, 30)).toBe(7.5);
    expect(snap(99, 1, 1, 50)).toBe(50);
    expect(snap(65, 8, 64, 2048)).toBe(64);
  });

  it("parses typed input, including small math", () => {
    expect(parseNumberInput("1,5")).toBe(1.5);
    expect(parseNumberInput("512*2")).toBe(1024);
    expect(parseNumberInput("abc")).toBeNull();
    expect(parseNumberInput("")).toBeNull();
  });
});
