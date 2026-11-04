/**
 * Dragging tiles into another order: the LoRA tiles above the prompt and an XY plot's picked
 * models. Native drag and drop (dnd-kit stays out of Generate's first load), plus Alt+← / Alt+→
 * on a tile's button for the keyboard; a thin accent line shows where a drop lands.
 */
import { cn } from "@client/lib/cn";
import { type DragEvent, type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

/** Controls inside a draggable tile carry this, so using them never starts a drag. */
export const NO_DRAG = "data-no-drag";

export const moveItem = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

export type DragProps = {
  draggable: boolean;
  onPointerDownCapture: (e: PointerEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
};

export interface Sortable {
  drag: DragProps;
  dragging: boolean;
  /** Where a drop would land, next to this tile. */
  marker: "before" | "after" | null;
  /** Alt+← / Alt+→ on the tile's button moves it (dragging for the keyboard). */
  onKeyDown: (e: KeyboardEvent) => void;
}

/** Native drag and drop (dnd-kit stays out of Generate's first load), plus Alt+arrows. */
export function useSortableRow(count: number, move: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; over: number | null; after: boolean } | null>(
    null,
  );
  const blocked = useRef(false);
  return (index: number): Sortable => ({
    dragging: drag?.from === index,
    marker:
      drag && drag.over === index && drag.from !== index ? (drag.after ? "after" : "before") : null,
    onKeyDown: (e) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      const to = index + (e.key === "ArrowLeft" ? -1 : 1);
      if (to >= 0 && to < count) move(index, to);
    },
    drag: {
      draggable: true,
      onPointerDownCapture: (e) => {
        blocked.current = Boolean((e.target as Element).closest(`[${NO_DRAG}]`));
      },
      onDragStart: (e) => {
        if (blocked.current) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-blombo-tile", String(index));
        setDrag({ from: index, over: null, after: false });
      },
      onDragOver: (e) => {
        if (!drag) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        if (drag.over !== index || drag.after !== after) setDrag({ ...drag, over: index, after });
      },
      onDrop: (e) => {
        if (!drag) return;
        e.preventDefault();
        let to = drag.after ? index + 1 : index;
        if (drag.from < to) to -= 1;
        if (to !== drag.from) move(drag.from, to);
        setDrag(null);
      },
      onDragEnd: () => setDrag(null),
    },
  });
}

export function DropMarker({ at }: { at: "before" | "after" | null }) {
  if (!at) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0.5 z-20 w-0.5 rounded-full bg-accent",
        at === "before" ? "-left-[5px]" : "-right-[5px]",
      )}
    />
  );
}
