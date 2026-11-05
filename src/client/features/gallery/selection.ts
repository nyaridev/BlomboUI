/**
 * Picking several gallery images at once: Ctrl (⌘) + click adds or removes one, Shift + click
 * takes everything between the last one clicked and this one (in the list's order). While any
 * are picked, a plain click picks too. Tiles read only whether they're in it.
 */
import { create } from "zustand";

interface Selection {
  ids: ReadonlySet<number>;
  /** The last image clicked: where a Shift + click range starts. */
  anchor: number | null;
  /** A click on `id` with these keys, over the list in its order. */
  click: (id: number, keys: { shift: boolean; toggle: boolean }, order: number[]) => void;
  set: (ids: number[]) => void;
  clear: () => void;
}

/** The ids a click leaves picked (pure, so it's tested without React). */
export function clicked(
  ids: ReadonlySet<number>,
  anchor: number | null,
  id: number,
  keys: { shift: boolean; toggle: boolean },
  order: number[],
): Set<number> {
  const next = new Set(ids);
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (keys.shift && from >= 0 && to >= 0) {
    const [a, b] = from < to ? [from, to] : [to, from];
    for (const i of order.slice(a, b + 1)) next.add(i);
  } else if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export const useSelection = create<Selection>((set, get) => ({
  ids: new Set(),
  anchor: null,
  click: (id, keys, order) =>
    set({ ids: clicked(get().ids, get().anchor, id, keys, order), anchor: id }),
  set: (ids) => set({ ids: new Set(ids), anchor: ids.at(-1) ?? null }),
  clear: () => set({ ids: new Set(), anchor: null }),
}));
