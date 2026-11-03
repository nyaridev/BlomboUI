/**
 * Times of day on the OS clock (shared/clock.ts), unless Settings → Appearance picks 24-hour or
 * AM/PM: every time the app shows goes through here, so a 24-hour Windows reads "17:17" even in
 * an English browser.
 */
import { type ClockFormat, formatClock, pickClock } from "@shared/clock";
import { useMemo } from "react";
import { useSettings, useSystem } from "./queries";

type When = Date | number | string;

/** The date part of a date with a time: "Nov 3, 2026". */
export const DATE_PART: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

function formatters(clock: ClockFormat | null) {
  return {
    /** "17:17", or "17:17:05" with seconds. */
    time: (at: When, seconds = false) => formatClock(at, clock, { seconds }),
    /** "Nov 3, 2026, 17:17" (another date part when given). */
    dateTime: (at: When, date: Intl.DateTimeFormatOptions = DATE_PART, seconds = false) =>
      formatClock(at, clock, { date, seconds }),
  };
}

export type Clock = ReturnType<typeof formatters>;

export function useClock(): Clock {
  const os = useSystem().data?.clock ?? null;
  const pref = useSettings().data?.appearance.clock ?? "system";
  const picked = pickClock(pref, os);
  const hour12 = picked?.hour12;
  const pad = picked?.pad;
  // Keyed by the two flags: a new settings or system object alone doesn't remake the formatters.
  return useMemo(
    () => formatters(hour12 === undefined || pad === undefined ? null : { hour12, pad }),
    [hour12, pad],
  );
}
