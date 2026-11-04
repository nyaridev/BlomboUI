/**
 * Dragging items into another order: the LoRA tiles above the prompt, an XY plot's picked models,
 * Settings → Folders rows and Customize mode's blocks. There's no ghost: the grabbed item lifts
 * where it is (`DRAG_LIFT`) and takes another item's place as soon as the pointer passes it, so
 * the list is always in the order a drop would leave. Escape puts it back. Alt+arrows move the
 * focused item for the keyboard. Near the edge of a scrolling list, the list scrolls.
 */
import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";

/** Controls inside a draggable item carry this, so using them never starts a drag. */
export const NO_DRAG = "data-no-drag";

/** The dragged item's look: lifted, outlined in the accent. */
export const DRAG_LIFT = "z-20 scale-[1.03] shadow-pop ring-2 ring-accent";

export const ALT_ARROWS = "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown";

export const moveItem = <T>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

export interface Sortable {
  /** On the element that moves (measured to find where the pointer is). */
  ref: (el: HTMLElement | null) => void;
  /** On what you grab: the item itself, or its handle. */
  handle: { onPointerDown: (e: PointerEvent) => void };
  dragging: boolean;
  /** Alt+arrows on the item's button move it (dragging for the keyboard). */
  onKeyDown: (e: KeyboardEvent) => void;
}

/**
 * `move(from, to, more)` runs on every swap; `more` is true after the first one of a drag, so a
 * caller with undo can keep one drag as one step.
 */
type Move = (from: number, to: number, more: boolean) => void;

const EDGE = 40;

export function useSortableRow(count: number, move: Move) {
  const items = useRef<(HTMLElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const live = useRef({ move, count });
  live.current = { move, count };
  // A swap re-renders before the next one is measured.
  const settled = useRef(true);
  useLayoutEffect(() => {
    settled.current = true;
  });

  const start = (index: number, e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest(`[${NO_DRAG}]`)) return;
    // Tiles take the mouse and pen; on touch they scroll. Handles take touch too.
    if (e.pointerType === "touch" && e.currentTarget === items.current[index]) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const origin = index;
    let at = index;
    let on = false;
    let moved = false;
    let px = x0;
    let py = y0;
    let frame = 0;
    let scroller: HTMLElement | null = null;

    const swap = (to: number) => {
      live.current.move(at, to, moved);
      moved = true;
      at = to;
      settled.current = false;
      setDragging(to);
    };

    const target = () => {
      const self = items.current[at];
      if (!self || !settled.current) return;
      const me = self.getBoundingClientRect();
      let best = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < live.current.count; i++) {
        const r = items.current[i]?.getBoundingClientRect();
        if (!r) continue;
        const dist = Math.hypot(
          Math.max(r.left - px, 0, px - r.right),
          Math.max(r.top - py, 0, py - r.bottom),
        );
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      if (best < 0 || best === at) return;
      const r = items.current[best]?.getBoundingClientRect();
      if (!r) return;
      if (passed(me, r, px, py, best > at)) swap(best);
    };

    const tick = () => {
      frame = 0;
      if (!scroller) return;
      const r = scroller.getBoundingClientRect();
      const speed = (lo: number, hi: number, p: number) =>
        p < lo + EDGE
          ? -Math.ceil((lo + EDGE - p) / 4)
          : p > hi - EDGE
            ? Math.ceil((p - hi + EDGE) / 4)
            : 0;
      const dx = scroller.scrollWidth > scroller.clientWidth ? speed(r.left, r.right, px) : 0;
      const dy = scroller.scrollHeight > scroller.clientHeight ? speed(r.top, r.bottom, py) : 0;
      if (!dx && !dy) return;
      scroller.scrollBy(dx, dy);
      target();
      frame = requestAnimationFrame(tick);
    };

    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      px = ev.clientX;
      py = ev.clientY;
      if (!on) {
        if (Math.hypot(px - x0, py - y0) < 4) return;
        on = true;
        scroller = scrollParent(items.current[at] ?? null);
        document.documentElement.dataset.sorting = "";
        setDragging(at);
      }
      ev.preventDefault();
      target();
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.sorting;
      setDragging(null);
    };
    const onUp = () => {
      // The click that ends a drag doesn't open what was dragged.
      if (on) {
        const eat = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener("click", eat, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", eat, true), 0);
      }
      stop();
    };
    const onKey = (k: globalThis.KeyboardEvent) => {
      if (k.key !== "Escape" || !on) return;
      k.preventDefault();
      k.stopPropagation();
      if (at !== origin) live.current.move(at, origin, true);
      stop();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey, true);
  };

  return (index: number): Sortable => ({
    ref: (el) => {
      items.current[index] = el;
    },
    handle: { onPointerDown: (e) => start(index, e) },
    dragging: dragging === index,
    onKeyDown: (e) => {
      if (!e.altKey) return;
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const to = index + step;
      if (to >= 0 && to < count) move(index, to, false);
    },
  });
}

type Box = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;

/**
 * Whether the pointer has gone far enough into `target` for the dragged item (`me`) to take its
 * place. Side by side it compares across, stacked it compares down, and it waits until the pointer
 * is where the dragged item will be, so items of different sizes don't swap back and forth.
 */
export function passed(me: Box, target: Box, px: number, py: number, forward: boolean): boolean {
  const across = target.top < me.bottom && me.top < target.bottom;
  const p = across ? px : py;
  const [lo, hi, size] = across
    ? [target.left, target.right, me.width]
    : [target.top, target.bottom, me.height];
  return forward ? p >= hi - size : p <= lo + size;
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (/auto|scroll/.test(s.overflowX + s.overflowY)) return p;
  }
  return document.scrollingElement as HTMLElement | null;
}
