import { describe, expect, it } from "vitest";
import { pickerOrder } from "./pickerOrder";

describe("pickerOrder", () => {
  const items = ["a.safetensors", "style/b.safetensors", "c.safetensors", "d.safetensors"];
  it("puts favorites first, then recent ones, then the rest", () => {
    const out = pickerOrder(items, (s) => s, new Set(["c.safetensors"]), ["b", "d.safetensors"]);
    expect(out).toEqual([
      { item: "c.safetensors", section: "favorite" },
      { item: "style/b.safetensors", section: "recent" },
      { item: "d.safetensors", section: "recent" },
      { item: "a.safetensors", section: null },
    ]);
  });

  it("keeps the order when there's nothing to put first", () => {
    expect(pickerOrder(items, (s) => s, new Set(), []).map((o) => o.item)).toEqual(items);
  });
});
