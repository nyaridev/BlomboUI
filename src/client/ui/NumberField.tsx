/**
 * NumberField: a typed number input with steppers. Click to type or select text like any text
 * box (no drag to scrub: that's ScrubField); wheel changes the value while focused; arrows step
 * (Shift ×10). Tabbing in selects the whole number.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { formatNumber, parseNumberInput, snap } from "@client/lib/number";
import { useEffect, useRef, useState } from "react";
import type { NumberControlProps } from "./Slider";

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
  size = "md",
  className,
  label,
}: NumberControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(formatNumber(value, step));
  const [focused, setFocused] = useState(false);
  // A click puts the caret where you click; only keyboard focus selects the whole number.
  const pointer = useRef(false);

  useEffect(() => {
    if (!focused) setText(formatNumber(value, step));
  }, [value, step, focused]);

  // Wheel needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      onChange(snap(value + dir * step * (e.shiftKey ? 10 : 1), step, min, max));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [value, step, min, max, onChange]);

  const commit = () => {
    const parsed = parseNumberInput(text);
    if (parsed !== null) onChange(snap(parsed, step, min, max));
    else setText(formatNumber(value, step));
  };

  const bump = (dir: 1 | -1, big = false) =>
    onChange(snap(value + dir * step * (big ? 10 : 1), step, min, max));

  const h = size === "sm" ? "h-7" : size === "lg" ? "h-10" : "h-8";

  return (
    <div
      className={cn(
        "group flex min-w-0 items-stretch overflow-hidden rounded-md border bg-field transition-colors",
        focused
          ? "border-accent-ink/70 ring-2 ring-accent/25"
          : "border-line hover:border-line-strong",
        disabled && "pointer-events-none opacity-45",
        h,
        className,
      )}
    >
      <input
        ref={inputRef}
        inputMode="decimal"
        size={1}
        aria-label={typeof label === "string" ? label : undefined}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onPointerDown={() => {
          pointer.current = true;
        }}
        onFocus={(e) => {
          setFocused(true);
          if (!pointer.current) e.currentTarget.select();
          pointer.current = false;
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(formatNumber(value, step));
            e.currentTarget.blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          }
        }}
        className="min-w-0 flex-1 bg-transparent pl-2.5 font-mono text-sm text-fg outline-none tabular"
      />
      {unit ? <span className="flex items-center pr-1.5 text-xs text-fg-3">{unit}</span> : null}
      <div className="flex w-5 flex-col border-l border-line">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          onClick={(e) => bump(1, e.shiftKey)}
          className="grid flex-1 place-items-center text-fg-3 hover:bg-field-hover hover:text-fg"
        >
          <Icon name="chevron-up" size={11} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          onClick={(e) => bump(-1, e.shiftKey)}
          className="grid flex-1 place-items-center border-t border-line text-fg-3 hover:bg-field-hover hover:text-fg"
        >
          <Icon name="chevron-down" size={11} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
