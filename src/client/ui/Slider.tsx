/**
 * Number controls driven by pointer capture:
 *  - Slider:     classic track + thumb, value shown and editable in the label row
 *  - ScrubField: a field-sized bar; drag anywhere to scrub, click to type (Blender-style)
 * Both: arrows ±step, Shift ×10, PageUp/PageDown ×10, Home/End, double-click resets to default.
 */
import { cn } from "@client/lib/cn";
import { clamp, formatNumber, parseNumberInput, snap } from "@client/lib/number";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from "react";

export interface NumberControlProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: ReactNode;
  /** The name screen readers use when there's no text label (a slider in a toolbar). */
  ariaLabel?: string;
  unit?: string;
  defaultValue?: number;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  format?: (value: number) => string;
  className?: string;
}

function keyStep(
  e: KeyboardEvent,
  step: number,
  min: number,
  max: number,
): number | "min" | "max" | null {
  const big = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case "ArrowRight":
    case "ArrowUp":
      return step * big;
    case "ArrowLeft":
    case "ArrowDown":
      return -step * big;
    case "PageUp":
      return step * 10;
    case "PageDown":
      return -step * 10;
    case "Home":
      return min === -Infinity ? null : "min";
    case "End":
      return max === Infinity ? null : "max";
    default:
      return null;
  }
}

/** Inline editable value: shows text, click to type, Enter commits, Esc cancels. */
function ValueEdit({
  value,
  step,
  min,
  max,
  unit,
  format,
  onCommit,
  className,
}: {
  value: number;
  step: number;
  min: number;
  max: number;
  unit?: string;
  format?: (v: number) => string;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const shown = format ? format(value) : formatNumber(value, step);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={formatNumber(value, step)}
        className={cn(
          "w-16 rounded-xs bg-field px-1 text-right font-mono text-xs text-fg outline outline-accent-ink tabular",
          className,
        )}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const parsed = parseNumberInput(e.currentTarget.value);
          if (parsed !== null) onCommit(snap(parsed, step, min, max));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "rounded-xs px-1 font-mono text-xs text-fg tabular hover:bg-field focus-ring",
        className,
      )}
      title="Click to type a value"
    >
      {shown}
      {unit ? <span className="ml-0.5 text-fg-3">{unit}</span> : null}
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  ariaLabel,
  unit,
  defaultValue,
  disabled,
  size = "md",
  format,
  marks,
  tone = "accent",
  className,
}: NumberControlProps & { marks?: number[]; tone?: "accent" | "generate" }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = max > min ? ((clamp(value, min, max) - min) / (max - min)) * 100 : 0;

  const fromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return value;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snap(min + t * (max - min), step, min, max);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(fromPointer(e.clientX));
    (e.currentTarget.querySelector("[role=slider]") as HTMLElement | null)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = keyStep(e, step, min, max);
    if (delta === null) return;
    e.preventDefault();
    if (delta === "min") onChange(min);
    else if (delta === "max") onChange(max);
    else onChange(snap(value + delta, step, min, max));
  };

  const fill = tone === "generate" ? "bg-generate-hi" : "bg-accent";
  const trackH = size === "sm" ? "h-1" : "h-1.5";
  const thumb = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        disabled && "pointer-events-none opacity-45",
        className,
      )}
    >
      {label !== undefined ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-fg-2">{label}</span>
          <ValueEdit
            value={value}
            step={step}
            min={min}
            max={max}
            unit={unit}
            format={format}
            onCommit={onChange}
          />
        </div>
      ) : null}
      <div
        ref={trackRef}
        className={cn(
          "relative flex touch-none items-center",
          size === "lg" ? "h-6" : "h-5",
          "cursor-pointer",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && onChange(fromPointer(e.clientX))}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-full bg-sunken ring-1 ring-line",
            trackH,
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              fill,
              !dragging && "transition-[width] duration-150",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {marks?.map((m) => (
          <span
            key={m}
            className="pointer-events-none absolute top-1/2 h-1 w-px -translate-y-1/2 bg-fg-4"
            style={{ left: `${((m - min) / (max - min)) * 100}%` }}
          />
        ))}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format ? format(value) : `${formatNumber(value, step)}${unit ?? ""}`}
          aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[var(--shadow-thumb)] ring-2 outline-none",
            tone === "generate" ? "ring-generate-hi" : "ring-accent",
            "transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-accent-ink/40",
            dragging ? "scale-115" : "hover:scale-110",
            !dragging && "transition-[left,transform]",
            thumb,
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ScrubField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  ariaLabel,
  unit,
  defaultValue,
  disabled,
  size = "md",
  format,
  className,
}: NumberControlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const pct = max > min ? ((clamp(value, min, max) - min) / (max - min)) * 100 : 0;
  const h = size === "sm" ? "h-7" : size === "lg" ? "h-10" : "h-8";

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || editing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: value, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const width = ref.current?.getBoundingClientRect().width ?? 200;
    const range = Number.isFinite(max - min) ? max - min : step * 200;
    const precision = e.shiftKey ? 0.1 : 1;
    onChange(snap(d.start + (dx / width) * range * precision, step, min, max));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setEditing(true);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter") {
          setEditing(true);
          return;
        }
        const delta = keyStep(e, step, min, max);
        if (delta === null) return;
        e.preventDefault();
        if (delta === "min") onChange(min);
        else if (delta === "max") onChange(max);
        else onChange(snap(value + delta, step, min, max));
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      className={cn(
        "group relative flex min-w-0 touch-none select-none items-center overflow-hidden rounded-md border border-line bg-field text-sm",
        "cursor-ew-resize transition-colors hover:border-line-strong focus-ring",
        disabled && "pointer-events-none opacity-45",
        h,
        className,
      )}
    >
      <div
        className="absolute inset-y-0 left-0 border-r-2 border-accent bg-accent/18 transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
      {editing ? (
        <input
          autoFocus
          defaultValue={formatNumber(value, step)}
          className="relative z-10 h-full w-full bg-transparent px-2.5 text-right font-mono text-sm text-fg outline-none tabular"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const parsed = parseNumberInput(e.currentTarget.value);
            if (parsed !== null) onChange(snap(parsed, step, min, max));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <>
          <span className="relative z-10 truncate pl-2.5 text-fg-2">{label}</span>
          <span className="relative z-10 ml-auto pr-2.5 pl-2 font-mono text-fg tabular">
            {format ? format(value) : formatNumber(value, step)}
            {unit ? <span className="ml-0.5 text-fg-3">{unit}</span> : null}
          </span>
        </>
      )}
    </div>
  );
}
