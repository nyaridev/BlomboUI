/**
 * Two images in one box, to see what changed between them:
 *
 *   flip    one at a time; a click (or Space while focused) switches, so the eye catches the
 *           difference in place
 *   slider  B under A, with a handle dragged (or moved with ← →) to reveal one or the other
 *   side    side by side
 *
 * Both fit the same box (`object-contain`), so images of one size line up exactly. Each corner
 * says which image it is. The box takes its size from the caller (give it a height).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { clamp } from "@client/lib/number";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

export type CompareMode = "flip" | "slider" | "side";

export interface CompareSide {
  src: string;
  /** "A · euler". */
  label: string;
}

const tag =
  "pointer-events-none absolute top-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white/90 tabular";

export function ImageCompare({
  a,
  b,
  mode,
  className,
}: {
  a: CompareSide;
  b: CompareSide;
  mode: CompareMode;
  className?: string;
}) {
  if (mode === "side")
    return (
      <div className={cn("grid min-h-0 grid-cols-2 gap-2 max-lg:grid-cols-1", className)}>
        {[a, b].map((s) => (
          <div key={s.src} className="relative min-h-0">
            <img src={s.src} alt={s.label} className="size-full object-contain" draggable={false} />
            <span className={cn(tag, "left-2")}>{s.label}</span>
          </div>
        ))}
      </div>
    );
  return mode === "flip" ? (
    <Flip a={a} b={b} className={className} />
  ) : (
    <Slider a={a} b={b} className={className} />
  );
}

function Flip({ a, b, className }: { a: CompareSide; b: CompareSide; className?: string }) {
  const [showB, setShowB] = useState(false);
  const shown = showB ? b : a;
  return (
    <button
      type="button"
      onClick={() => setShowB((v) => !v)}
      aria-label={`Showing ${shown.label}. Click to switch.`}
      className={cn("relative block min-h-0 cursor-pointer focus-ring", className)}
    >
      {/* Both stay loaded, so switching is instant. */}
      <img
        src={a.src}
        alt={a.label}
        draggable={false}
        className={cn("absolute inset-0 size-full object-contain", showB && "invisible")}
      />
      <img
        src={b.src}
        alt={b.label}
        draggable={false}
        className={cn("absolute inset-0 size-full object-contain", !showB && "invisible")}
      />
      <span className={cn(tag, "left-2")}>{shown.label}</span>
      <span className={cn(tag, "right-2 text-white/60")}>Click to switch</span>
    </button>
  );
}

function Slider({ a, b, className }: { a: CompareSide; b: CompareSide; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const move = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setPos((p) => clamp(p - step, 0, 100));
    else if (e.key === "ArrowRight") setPos((p) => clamp(p + step, 0, 100));
    else if (e.key === "Home") setPos(0);
    else if (e.key === "End") setPos(100);
    else return;
    e.preventDefault();
  };
  return (
    <div
      ref={box}
      className={cn("relative min-h-0 cursor-ew-resize touch-none select-none", className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
      }}
    >
      <img
        src={b.src}
        alt={b.label}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
      <img
        src={a.src}
        alt={a.label}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Where the images meet"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={onKey}
        className="absolute inset-y-0 -ml-3 flex w-6 justify-center focus-ring rounded-md"
        style={{ left: `${pos}%` }}
      >
        <span className="h-full w-0.5 bg-white/90 shadow-pop" />
        <span className="absolute top-1/2 flex h-8 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-white text-black/70 shadow-pop">
          <Icon name="swap-horizontal" size={12} />
        </span>
      </div>
      <span className={cn(tag, "left-2")}>{a.label}</span>
      <span className={cn(tag, "right-2")}>{b.label}</span>
    </div>
  );
}
