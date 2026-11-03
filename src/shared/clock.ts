/**
 * How the OS shows the time of day, so times in the app read like the taskbar clock. Browsers
 * format times by their own language (an English browser says "5:17 PM" on a 24-hour Windows),
 * so the server reads Windows' short time pattern ("HH:mm", "h:mm tt") and the client formats
 * times with `formatClock`.
 */

export interface ClockFormat {
  /** AM/PM instead of 0–23. */
  hour12: boolean;
  /** A leading zero on hours below 10 ("09:05"). */
  pad: boolean;
}

/** A Windows time pattern ("HH:mm", "H:mm", "h:mm tt", "hh:mm:ss tt") → its clock; null if none. */
export function parseTimePattern(pattern: string): ClockFormat | null {
  // Quoted literals ('h' in a pattern like "H'h'mm") aren't hour fields.
  const fields = pattern.replace(/'[^']*'/g, "");
  const hours = /H+|h+/.exec(fields)?.[0];
  if (!hours) return null;
  return { hour12: hours[0] === "h", pad: hours.length > 1 };
}

/**
 * A date's time of day (with seconds when asked, after the `date` parts when given) on the OS
 * clock; without one, the language's own. Intl can't drop or add the hour's leading zero
 * reliably, so the hour part is fixed by hand.
 */
export function formatClock(
  value: Date | number | string,
  clock: ClockFormat | null,
  options: { seconds?: boolean; date?: Intl.DateTimeFormatOptions; locale?: string } = {},
): string {
  const parts = new Intl.DateTimeFormat(options.locale, {
    ...options.date,
    hour: "numeric",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" as const } : {}),
    ...(clock ? { hourCycle: clock.hour12 ? ("h12" as const) : ("h23" as const) } : {}),
  }).formatToParts(new Date(value));
  return parts
    .map((p) => {
      if (p.type !== "hour" || !clock) return p.value;
      const h = p.value.replace(/^0(?=\d)/, "");
      return clock.pad ? h.padStart(2, "0") : h;
    })
    .join("");
}
