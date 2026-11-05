import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  monthGrid,
  pickDay,
  quickRanges,
  shiftMonth,
  today,
} from "./calendar";

describe("calendar days", () => {
  it("counts and moves days across months and years", () => {
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-09-01", "2026-10-01")).toBe(30);
    expect(daysBetween("2026-10-01", "2026-09-01")).toBe(-30);
    expect(today(new Date(2026, 10, 5, 23, 30))).toBe("2026-11-05");
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("lays a month out in six weeks, Monday first", () => {
    // November 2026 starts on a Sunday: six days of October come first.
    const grid = monthGrid({ year: 2026, month: 10 });
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(grid[6]).toBe("2026-11-01");
    expect(grid[41]).toBe("2026-12-06");
  });

  it("starts a range, ends it in either order, and starts again after a whole one", () => {
    const started = pickDay({ from: "", to: "" }, "2026-09-10");
    expect(started).toEqual({ from: "2026-09-10", to: "" });
    expect(pickDay(started, "2026-09-20")).toEqual({ from: "2026-09-10", to: "2026-09-20" });
    expect(pickDay(started, "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    expect(pickDay({ from: "2026-09-01", to: "2026-09-05" }, "2026-09-03")).toEqual({
      from: "2026-09-03",
      to: "",
    });
  });

  it("offers quick ranges that end today and fit in 31 days", () => {
    const quick = Object.fromEntries(quickRanges("2026-03-15").map((q) => [q.label, q.range]));
    expect(quick["Last 7 days"]).toEqual({ from: "2026-03-09", to: "2026-03-15" });
    expect(quick["Last 30 days"]).toEqual({ from: "2026-02-14", to: "2026-03-15" });
    expect(quick["This month"]).toEqual({ from: "2026-03-01", to: "2026-03-15" });
    expect(quick["Last month"]).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    for (const q of Object.values(quick)) expect(daysBetween(q.from, q.to)).toBeLessThan(31);
  });
});
