/**
 * Day math for RangeCalendar: days are "YYYY-MM-DD" strings (UTC, the form date filters take),
 * so comparing two is comparing text. Weeks start on Monday.
 */

const DAY_MS = 24 * 3600_000;

export interface DayRange {
  from: string;
  to: string;
}

export const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => dayOf(dayMs(day) + n * DAY_MS);
/** Days from `a` to `b` (negative when `b` comes first). */
export const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);

/** Today on this computer's clock, as a day. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface Month {
  year: number;
  /** 0–11 */
  month: number;
}

export const monthOf = (day: string): Month => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)) - 1,
});

export function shiftMonth(m: Month, by: number): Month {
  const d = new Date(Date.UTC(m.year, m.month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month;

/** The six weeks a month shows, Monday first, with the neighbouring months' days around it. */
export function monthGrid(m: Month): string[] {
  const first = Date.UTC(m.year, m.month, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => dayOf(first + (i - lead) * DAY_MS));
}

/**
 * The range after a click on `day`: the first click starts a range, the second ends it (in
 * either order), a click after a whole range starts a new one.
 */
export function pickDay(range: DayRange, day: string): DayRange {
  if (!range.from || range.to) return { from: day, to: "" };
  return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
}

/** Quick picks, each ending today (Last month: the whole previous month). */
export function quickRanges(now: string): Array<{ label: string; range: DayRange }> {
  const m = monthOf(now);
  const first = (x: Month) => dayOf(Date.UTC(x.year, x.month, 1));
  const prev = shiftMonth(m, -1);
  return [
    { label: "Last 7 days", range: { from: addDays(now, -6), to: now } },
    { label: "Last 30 days", range: { from: addDays(now, -29), to: now } },
    { label: "This month", range: { from: first(m), to: now } },
    { label: "Last month", range: { from: first(prev), to: addDays(first(m), -1) } },
  ];
}
