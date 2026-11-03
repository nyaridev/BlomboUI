/**
 * A grip that resizes the box it sits in (instead of the browser's resize corner, which can't be
 * moved or double-clicked). Where it sits says which way it goes: bottom center for height,
 * right edge for width, bottom-right corner for both. Drag to resize; double-click (or Enter)
 * fits the box to its content, never smaller than its default size nor taller than `maxFit`.
 * Arrow keys resize by 16 px (Shift: 64). The box needs `position: relative`.
 */
import { cn } from "@client/lib/cn";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

export type ResizeAxis = "x" | "y" | "both";

export function ResizeGrip({
  target,
  axis = "y",
  fitSize,
  maxFit = { width: 900, height: 360 },
  label = "Resize",
  onResize,
  className,
}: {
  /** The box that changes size. */
  target: RefObject<HTMLElement | null>;
  axis?: ResizeAxis;
  /** The content's own size in px, borders included; without it a double-click resets. */
  fitSize?: () => { width?: number; height?: number };
  maxFit?: { width: number; height: number };
  label?: string;
  /** After each change: `fitted` is true for a fit, false for a drag or arrow key. */
  onResize?: (fitted: boolean) => void;
  className?: string;
}) {
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const doesX = axis !== "y";
  const doesY = axis !== "x";
  // The size screen readers hear: the height, or the width for a sideways grip.
  const [now, setNow] = useState(0);
  const measure = () => {
    const r = target.current?.getBoundingClientRect();
    if (r) setNow(Math.round(axis === "x" ? r.width : r.height));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured once; resizes measure again
  useLayoutEffect(measure, []);

  const resizeBy = (
    dw: number,
    dh: number,
    from: { width: number; height: number } | undefined = target.current?.getBoundingClientRect(),
  ) => {
    const el = target.current;
    if (!el || !from) return;
    if (doesX) el.style.width = `${Math.max(0, from.width + dw)}px`;
    if (doesY) el.style.height = `${Math.max(0, from.height + dh)}px`;
  };

  const fitContent = () => {
    const el = target.current;
    if (!el) return;
    // The default size is whatever the box is without a size of ours.
    if (doesX) el.style.width = "";
    if (doesY) el.style.height = "";
    const base = el.getBoundingClientRect();
    const want = fitSize?.() ?? {};
    if (doesX && want.width && want.width > base.width)
      el.style.width = `${Math.min(want.width, maxFit.width)}px`;
    if (doesY && want.height && want.height > base.height)
      el.style.height = `${Math.min(want.height, maxFit.height)}px`;
    measure();
    onResize?.(true);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = target.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    resizeBy(e.clientX - d.x, e.clientY - d.y, { width: d.w, height: d.h });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    if (e.key === "Enter") {
      e.preventDefault();
      fitContent();
      return;
    }
    const move = moves[e.key];
    if (!move || (move[0] && !doesX) || (move[1] && !doesY)) return;
    e.preventDefault();
    resizeBy(move[0], move[1]);
    measure();
    onResize?.(false);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`${label}. Double-click or Enter fits the content`}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={now}
      aria-valuemin={0}
      aria-valuemax={axis === "x" ? maxFit.width : maxFit.height}
      title="Drag to resize, double-click to fit"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        measure();
        onResize?.(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={fitContent}
      onKeyDown={onKeyDown}
      className={cn(
        "group/grip absolute z-10 grid touch-none place-items-center rounded-xs focus-ring",
        axis === "y" && "bottom-0 left-1/2 h-3 w-12 -translate-x-1/2 cursor-ns-resize",
        axis === "x" && "top-1/2 right-0 h-12 w-3 -translate-y-1/2 cursor-ew-resize",
        axis === "both" && "right-0 bottom-0 h-4 w-4 cursor-nwse-resize",
        className,
      )}
    >
      {axis === "both" ? (
        <span className="mr-0.5 mb-0.5 h-2 w-2 self-end justify-self-end rounded-br-xs border-r-2 border-b-2 border-fg-4 transition-colors group-hover/grip:border-fg-2" />
      ) : (
        <span
          className={cn(
            "rounded-full bg-fg-4 transition-colors group-hover/grip:bg-fg-2",
            axis === "y" ? "h-1 w-7" : "h-7 w-1",
          )}
        />
      )}
    </div>
  );
}
