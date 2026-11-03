/**
 * The divider between two side-by-side panes: a thin line with a wider hit area. Drag it to give
 * the left pane a different share of the row, double-click to reset, or focus it and use ← →
 * (Shift: bigger steps). `onChange` follows the drag; `onCommit` fires once it ends, for saving.
 */
import { cn } from "@client/lib/cn";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useRef } from "react";

export function Splitter({
  container,
  share,
  onChange,
  onCommit,
  onReset,
  min = 0.3,
  max = 0.75,
  minLeft = 280,
  minRight = 280,
  label = "Resize panes",
  className,
}: {
  /** The row both panes sit in; shares are fractions of its width. */
  container: RefObject<HTMLElement | null>;
  /** The left pane's share of the row (0–1). */
  share: number;
  onChange: (share: number) => void;
  onCommit?: (share: number) => void;
  onReset?: () => void;
  min?: number;
  max?: number;
  /** Neither pane gets narrower than this many px, whatever the share. */
  minLeft?: number;
  minRight?: number;
  label?: string;
  className?: string;
}) {
  const dragging = useRef(false);
  const latest = useRef(share);
  latest.current = share;

  const clamp = (value: number) => {
    const width = container.current?.getBoundingClientRect().width ?? 0;
    const lo = width ? Math.max(min, minLeft / width) : min;
    const hi = width ? Math.min(max, 1 - minRight / width) : max;
    return Math.min(Math.max(value, lo), Math.max(lo, hi));
  };
  const set = (value: number) => {
    const next = clamp(value);
    latest.current = next;
    onChange(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = container.current?.getBoundingClientRect();
    if (!dragging.current || !rect?.width) return;
    set((e.clientX - rect.left) / rect.width);
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onCommit?.(latest.current);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.02;
    set(share + (e.key === "ArrowLeft" ? -step : step));
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      title={onReset ? "Drag to resize, double-click to reset" : "Drag to resize"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") onCommit?.(latest.current);
      }}
      onDoubleClick={onReset}
      className={cn(
        "group/split flex w-6 shrink-0 cursor-col-resize touch-none justify-center self-stretch rounded-xs focus-ring",
        className,
      )}
    >
      <span className="w-px bg-line transition-colors group-hover/split:bg-fg-4 group-focus-visible/split:bg-accent-ink" />
    </div>
  );
}
