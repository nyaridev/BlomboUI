import type { GalleryImage } from "@shared/gallery";
import { describe, expect, it } from "vitest";
import { buildRows, dayLabel, GAP, HEADER_H } from "./rows";

const img = (id: number, day: string, w = 100, h = 100): GalleryImage => ({
  id,
  library: "outputs",
  path: `${id}.png`,
  name: `${id}.png`,
  width: w,
  height: h,
  size: 1,
  mtime: new Date(`${day}T12:00:00`).getTime(),
  favorite: false,
  model: null,
  thumb: "",
});

describe("buildRows", () => {
  const items = [img(1, "2026-10-15"), img(2, "2026-10-15"), img(3, "2026-10-14")];

  it("groups by day with headers and exact heights", () => {
    const rows = buildRows({
      items,
      layout: "grid",
      width: 206,
      size: 100,
      byDay: true,
      hero: false,
      complete: true,
    });
    expect(rows.map((r) => r.kind)).toEqual(["header", "images", "header", "images"]);
    expect(rows[0]).toMatchObject({ height: HEADER_H, day: "2026-10-15", count: 2 });
    expect(rows[1]?.height).toBe(100 + GAP);
    expect(rows[1]?.kind === "images" && rows[1].items.length).toBe(2);
  });

  it("leaves the last day's count open until everything is loaded", () => {
    const rows = buildRows({
      items,
      layout: "justified",
      width: 600,
      size: 120,
      byDay: true,
      hero: true,
      complete: false,
    });
    expect(rows[0]?.kind).toBe("hero");
    const headers = rows.filter((r) => r.kind === "header");
    expect(headers.map((h) => h.kind === "header" && h.count)).toEqual([2, null]);
  });

  it("returns nothing before the width is known", () => {
    expect(
      buildRows({
        items,
        layout: "grid",
        width: 0,
        size: 100,
        byDay: false,
        hero: false,
        complete: true,
      }),
    ).toEqual([]);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 9, 15, 18);
  it("names recent days", () => {
    expect(dayLabel("2026-10-15", now)).toBe("Today");
    expect(dayLabel("2026-10-14", now)).toBe("Yesterday");
    expect(dayLabel("2025-01-02", now)).toMatch(/2025/);
  });
});
