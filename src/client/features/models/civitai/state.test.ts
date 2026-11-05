import { BrowseFilter } from "@shared/civitai";
import { CivitaiSettings } from "@shared/settings";
import { describe, expect, it } from "vitest";
import { readSaved, useCivitai } from "./state";

describe("readSaved", () => {
  it("keeps a valid filter and tabs, and the active tab when it's open", () => {
    const r = readSaved({
      filter: { query: "neon", types: ["LORA"], sort: "Oldest" },
      tabs: [{ id: 7, name: "Neon" }, { id: "x" }, { id: 9, name: "" }],
      active: 7,
      home: "following",
    });
    expect(r.filter).toMatchObject({ query: "neon", types: ["LORA"], sort: "Oldest" });
    expect(r.tabs).toEqual([{ id: 7, name: "Neon" }]);
    expect(r.active).toBe(7);
    expect(r.home).toBe("following");
  });

  it("drops what isn't valid anymore", () => {
    expect(readSaved({ filter: { sort: "Random" }, tabs: "no", active: 3, home: "x" })).toEqual({
      filter: null,
      tabs: [],
      active: null,
      home: "browse",
    });
    expect(readSaved(null)).toEqual({ filter: null, tabs: [], active: null, home: "browse" });
  });
});

describe("seed", () => {
  it("starts a saved filter at the default period, once a window", () => {
    const browse = CivitaiSettings.parse({}).browse;
    useCivitai.getState().replaceFilter(BrowseFilter.parse({ query: "neon", period: "Month" }));
    useCivitai.getState().seed(browse);
    expect(useCivitai.getState().filter).toMatchObject({ query: "neon", period: "AllTime" });
    useCivitai.getState().setFilter({ period: "Week" });
    useCivitai.getState().seed(browse);
    expect(useCivitai.getState().filter?.period).toBe("Week");
  });
});

describe("looking at", () => {
  it("keeps every creator opened, newest first, and closes one or all", () => {
    const s = () => useCivitai.getState();
    s().clearVisits();
    s().visit("ana");
    s().visit("Bo");
    s().visit("ANA");
    expect(s().visiting).toEqual(["ANA", "Bo"]);
    expect(s().creator).toBe("ANA");
    s().endVisit("ana");
    expect(s().visiting).toEqual(["Bo"]);
    expect(s().creator).toBeNull();
    s().pickCreator("Bo");
    s().clearVisits();
    expect(s().visiting).toEqual([]);
    expect(s().creator).toBeNull();
  });
});
