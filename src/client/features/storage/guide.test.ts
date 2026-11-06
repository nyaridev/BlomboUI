import type { DevFile, DevTable } from "@shared/dev";
import { describe, expect, it } from "vitest";
import { columnType, sortFiles, sortTables } from "./guide";

const file = (path: string, size = 1, dir = false, files: number | null = null): DevFile => ({
  path,
  size,
  dir,
  files,
});

describe("sortFiles", () => {
  it("groups files the way a person thinks about them", () => {
    const groups = sortFiles([
      file("trash", 30, true, 3),
      file("workflows", 0, true),
      file("workflows/sdxl", 0, true),
      file("workflows/sdxl/workflow.json", 5),
      file("workflows/sdxl/graph.json", 7),
      file("layouts/mine.json", 2),
      file("grids/x.png", 9),
      file("profile.json", 1),
      file("secrets.json", 1),
      file("avatar.webp", 4),
      file("blombo.sqlite", 100),
      file("blombo.sqlite-wal", 10),
    ]);
    expect(groups.map((g) => [g.group.id, g.entries.map((e) => e.label), g.size])).toEqual([
      ["profile", ["Name, theme, accent and folders", "Civitai API key", "Profile picture"], 6],
      ["workflows", ["sdxl"], 12],
      ["layouts", ["mine"], 2],
      ["database", ["The database", "Recent changes, merged in later"], 110],
      ["trash", ["Removed images"], 30],
      ["other", ["x.png"], 9],
    ]);
    expect(groups[0]?.entries.find((e) => e.path === "secrets.json")?.secret).toBe(true);
    expect(groups[1]?.entries[0]?.files).toBe(2);
  });
});

describe("sortTables", () => {
  it("puts known tables in their group and the rest in Other", () => {
    const table = (name: string) => ({ name }) as DevTable;
    const groups = sortTables([
      table("images"),
      table("marks"),
      table("job_log"),
      table("new_one"),
    ]);
    expect(groups.map((g) => [g.group.id, g.tables.map((t) => t.name)])).toEqual([
      ["index", ["images"]],
      ["marks", ["marks"]],
      ["history", ["job_log"]],
      ["other", ["new_one"]],
    ]);
  });
});

describe("columnType", () => {
  it("says database types in words", () => {
    expect(["INTEGER", "REAL", "TEXT", "BLOB", ""].map(columnType)).toEqual([
      "whole number",
      "number",
      "text",
      "data",
      "anything",
    ]);
  });
});
