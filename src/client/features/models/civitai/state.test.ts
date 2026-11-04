import { describe, expect, it } from "vitest";
import { readSaved } from "./state";

describe("readSaved", () => {
  it("keeps a valid filter and tabs, and the active tab when it's open", () => {
    const r = readSaved({
      filter: { query: "neon", types: ["LORA"], sort: "Oldest" },
      tabs: [{ id: 7, name: "Neon" }, { id: "x" }, { id: 9, name: "" }],
      active: 7,
    });
    expect(r.filter).toMatchObject({ query: "neon", types: ["LORA"], sort: "Oldest" });
    expect(r.tabs).toEqual([{ id: 7, name: "Neon" }]);
    expect(r.active).toBe(7);
  });

  it("drops what isn't valid anymore", () => {
    expect(readSaved({ filter: { sort: "Random" }, tabs: "no", active: 3 })).toEqual({
      filter: null,
      tabs: [],
      active: null,
    });
    expect(readSaved(null)).toEqual({ filter: null, tabs: [], active: null });
  });
});
