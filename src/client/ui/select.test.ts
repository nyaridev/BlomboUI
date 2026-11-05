import { describe, expect, it } from "vitest";
import { matchOptions } from "./Select";

const OPTIONS = [
  { value: "a", label: "Highest Rated" },
  { value: "b", label: "Most Collected", group: "Stability SD" },
  { value: "c", label: "SDXL 1.0", group: "Stability SD" },
];

describe("matchOptions", () => {
  it("keeps labels that contain every word, ignoring case and group names", () => {
    expect(matchOptions(OPTIONS, "  ")).toHaveLength(3);
    expect(matchOptions(OPTIONS, "COLL").map((o) => o.value)).toEqual(["b"]);
    expect(matchOptions(OPTIONS, "sd").map((o) => o.value)).toEqual(["c"]);
    expect(matchOptions(OPTIONS, "zzz")).toEqual([]);
    // Each word on its own, in any order.
    expect(matchOptions(OPTIONS, "sdxl 1.0").map((o) => o.value)).toEqual(["c"]);
    expect(matchOptions(OPTIONS, "rated high").map((o) => o.value)).toEqual(["a"]);
    expect(matchOptions(OPTIONS, "sdxl 2")).toEqual([]);
  });
});
