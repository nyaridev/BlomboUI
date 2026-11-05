/**
 * RangeCalendar: pick a range of days on a month grid. Click a start day, then an end day (in
 * either order); while the end is open, the range follows the pointer. `maxDays` greys out the
 * days that would make it longer, `latest` the days after it (today, say). A line under the grid
 * says what to do next or how many days are picked. Only a whole range reaches `onChange`.
 * Keyboard: arrows move a day or a week, Page Up / Page Down a month, Home / End the week,
 * Enter or Space picks, Escape drops a started range.
 */
import { cn } from "@client/lib/cn";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import {
  addDays,
  type DayRange,
  daysBetween,
  monthGrid,
  monthOf,
  pickDay,
  sameMonth,
  shiftMonth,
  today,
} from "./calendar";

const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  // 2024-01-01 was a Monday.
  new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  }),
);

const long = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const short = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function RangeCalendar({
  from,
  to,
  onChange,
  maxDays,
  latest = today(),
  className,
}: {
  from: string;
  to: string;
  onChange: (range: DayRange) => void;
  /** The longest range, counting both ends. */
  maxDays?: number;
  /** The last day that can be picked; "" for none. */
  latest?: string;
  className?: string;
}) {
  const now = today();
  /** A range whose end isn't picked yet. */
  const [draft, setDraft] = useState<DayRange | null>(null);
  const shown = draft ?? { from, to };
  const [view, setView] = useState(() => monthOf(to || from || now));
  const [hover, setHover] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState(to || from || now);
  const grid = useRef<HTMLDivElement>(null);
  const keyed = useRef(false);

  // A range set from outside (a quick pick, Clear) shows its month and ends a started one.
  useEffect(() => {
    setDraft(null);
    if (to || from) {
      setView(monthOf(to || from));
      setFocusDay(to || from);
    }
  }, [from, to]);

  // After a key moved the focus, put it on that day's button.
  useEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  });

  const tooFar = (day: string) =>
    Boolean(draft && maxDays && Math.abs(daysBetween(draft.from, day)) > maxDays - 1);
  const disabled = (day: string) => Boolean(latest && day > latest) || tooFar(day);

  const pick = (day: string) => {
    if (disabled(day)) return;
    const next = pickDay(shown, day);
    if (next.to) {
      setDraft(null);
      onChange(next);
    } else setDraft(next);
  };

  // The band to paint: the range, or the started one up to the hovered day.
  const end = shown.to || (draft && hover && !disabled(hover) ? hover : "");
  const lo = end && end < shown.from ? end : shown.from;
  const hi = end && end < shown.from ? shown.from : end || shown.from;

  const move = (to: string) => {
    // Days after `latest` can't take the focus.
    const day = latest && to > latest ? latest : to;
    keyed.current = true;
    setFocusDay(day);
    if (!sameMonth(monthOf(day), view)) setView(monthOf(day));
  };
  const onKeyDown = (e: KeyboardEvent, day: string) => {
    const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -weekday),
      End: () => addDays(day, 6 - weekday),
      PageUp: () => shiftDay(day, -1),
      PageDown: () => shiftDay(day, 1),
    };
    const step = steps[e.key];
    if (step) {
      e.preventDefault();
      move(step());
    } else if (e.key === "Escape" && draft) {
      // Drops the started range; a second Escape closes whatever the calendar sits in.
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
    }
  };

  const days = monthGrid(view);
  const span = shown.from && shown.to ? daysBetween(shown.from, shown.to) + 1 : 0;
  const lastMonth = latest ? monthOf(latest) : null;
  const label = new Date(Date.UTC(view.year, view.month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1">
        <IconButton
          icon="chevron-left"
          size="sm"
          label="Previous month"
          onClick={() => setView(shiftMonth(view, -1))}
        />
        <span className="flex-1 text-center text-sm font-medium text-fg" aria-live="polite">
          {label}
        </span>
        <IconButton
          icon="chevron-right"
          size="sm"
          label="Next month"
          disabled={Boolean(lastMonth && sameMonth(view, lastMonth))}
          onClick={() => setView(shiftMonth(view, 1))}
        />
      </div>
      <div
        ref={grid}
        role="group"
        aria-label={label}
        className="grid grid-cols-7 gap-y-0.5"
        onPointerLeave={() => setHover(null)}
      >
        {WEEKDAYS.map((w) => (
          <span key={w} aria-hidden className="pb-1 text-center text-2xs font-medium text-fg-3">
            {w}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = sameMonth(monthOf(day), view);
          const off = disabled(day);
          const edgeLo = lo !== "" && day === lo;
          const edgeHi = hi !== "" && day === hi;
          const inside = lo !== "" && day > lo && day < hi;
          return (
            <div
              key={day}
              className={cn(
                "h-8",
                inside && "bg-accent/15",
                edgeLo && hi !== lo && "rounded-l-md bg-accent/15",
                edgeHi && hi !== lo && "rounded-r-md bg-accent/15",
              )}
            >
              <button
                type="button"
                data-day={day}
                tabIndex={day === focusDay ? 0 : -1}
                disabled={off}
                aria-label={long(day)}
                aria-pressed={edgeLo || edgeHi || inside}
                aria-current={day === now ? "date" : undefined}
                onClick={() => pick(day)}
                onPointerEnter={() => setHover(day)}
                onFocus={() => setFocusDay(day)}
                onKeyDown={(e) => onKeyDown(e, day)}
                className={cn(
                  "relative grid h-8 w-full place-items-center rounded-md text-sm tabular transition-colors focus-ring",
                  edgeLo || edgeHi
                    ? "bg-accent font-medium text-on-accent"
                    : inside
                      ? "text-fg hover:bg-accent/20"
                      : inMonth
                        ? "text-fg-2 hover:bg-field hover:text-fg"
                        : "text-fg-4 hover:bg-field",
                  off && "pointer-events-none opacity-30",
                )}
              >
                {Number(day.slice(8))}
                {day === now && !(edgeLo || edgeHi) ? (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent-ink" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-2xs text-pretty text-fg-3" aria-live="polite">
        {draft
          ? `From ${short(draft.from)}: now pick the end day${maxDays ? ` (${maxDays} days at most)` : ""}.`
          : span
            ? `${short(shown.from)} – ${short(shown.to)} · ${span} ${span === 1 ? "day" : "days"}`
            : "Pick the first day, then the last."}
      </p>
    </div>
  );
}

/** The same day of the month `by` months away (the last day when that month is shorter). */
function shiftDay(day: string, by: number): string {
  const m = shiftMonth(monthOf(day), by);
  const last = new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();
  const d = Math.min(Number(day.slice(8)), last);
  return `${m.year}-${String(m.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
