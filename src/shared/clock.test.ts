import { describe, expect, it } from "vitest";
import { formatClock, parseTimePattern, pickClock } from "./clock.ts";

describe("parseTimePattern", () => {
  it("reads 24-hour and 12-hour patterns", () => {
    expect(parseTimePattern("HH:mm")).toEqual({ hour12: false, pad: true });
    expect(parseTimePattern("H:mm")).toEqual({ hour12: false, pad: false });
    expect(parseTimePattern("h:mm tt")).toEqual({ hour12: true, pad: false });
    expect(parseTimePattern("hh:mm:ss tt")).toEqual({ hour12: true, pad: true });
    expect(parseTimePattern("H'h'mm")).toEqual({ hour12: false, pad: false });
    expect(parseTimePattern("")).toBeNull();
  });
});

describe("pickClock", () => {
  const os = { hour12: false, pad: false };
  it("follows the OS unless the settings pick a clock", () => {
    expect(pickClock("system", os)).toBe(os);
    expect(pickClock("system", null)).toBeNull();
    expect(pickClock("24h", os)).toEqual({ hour12: false, pad: false });
    expect(pickClock("12h", os)).toEqual({ hour12: true, pad: false });
    expect(pickClock("24h", null)).toEqual({ hour12: false, pad: true });
  });
});

describe("formatClock", () => {
  const at = new Date(2026, 10, 3, 17, 7, 9);
  const morning = new Date(2026, 10, 3, 9, 5, 0);
  const locale = "en-US";
  const h23 = { hour12: false, pad: true };
  // ICU puts a narrow no-break space before AM/PM.
  const plain = (s: string) => s.replace(/\s/g, " ");

  it("follows the OS clock whatever the language", () => {
    expect(formatClock(at, h23, { locale })).toBe("17:07");
    expect(formatClock(at, h23, { locale, seconds: true })).toBe("17:07:09");
    expect(formatClock(morning, h23, { locale })).toBe("09:05");
    expect(formatClock(morning, { hour12: false, pad: false }, { locale })).toBe("9:05");
    expect(plain(formatClock(at, { hour12: true, pad: false }, { locale }))).toBe("5:07 PM");
    expect(plain(formatClock(morning, { hour12: true, pad: true }, { locale }))).toBe("09:05 AM");
  });

  it("puts the date first when asked, and keeps the language's clock without an OS one", () => {
    expect(formatClock(at, h23, { locale, date: { month: "short", day: "numeric" } })).toBe(
      "Nov 3, 17:07",
    );
    expect(plain(formatClock(at, null, { locale }))).toBe("5:07 PM");
  });
});
