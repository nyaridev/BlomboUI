/**
 * The gallery as a flat list of rows for the virtualizer: an optional hero, a header per day,
 * and image rows (justified or a square grid). Heights are exact, so the virtualizer never has
 * to measure, and only the visible rows are mounted.
 */
import { dayKey, type GalleryImage } from "@shared/gallery";
import { type JustifiedItem, justify } from "./justify";

export const GAP = 6;
export const HEADER_H = 52;
export const HERO_H = 316;

export type GalleryRow =
  | { kind: "hero"; key: string; height: number }
  | { kind: "header"; key: string; height: number; day: string; count: number | null }
  | {
      kind: "images";
      key: string;
      height: number;
      items: Array<JustifiedItem<GalleryImage>>;
    };

const ratio = (i: GalleryImage) => (i.width > 0 && i.height > 0 ? i.width / i.height : 1);

function imageRows(
  items: GalleryImage[],
  layout: "justified" | "grid",
  width: number,
  size: number,
): Array<Array<JustifiedItem<GalleryImage>>> {
  if (layout === "justified") {
    // Panoramas would make a row tiny; clamp the ratio used for layout.
    return justify(items, (i) => Math.min(3, Math.max(0.33, ratio(i))), width, size, GAP);
  }
  const cols = Math.max(1, Math.floor((width + GAP) / (size + GAP)));
  const cell = (width - GAP * (cols - 1)) / cols;
  const rows: Array<Array<JustifiedItem<GalleryImage>>> = [];
  for (let i = 0; i < items.length; i += cols)
    rows.push(items.slice(i, i + cols).map((item) => ({ item, width: cell, height: cell })));
  return rows;
}

export function buildRows(opts: {
  items: GalleryImage[];
  layout: "justified" | "grid";
  width: number;
  size: number;
  /** Group by day (date sorts); name sort shows one block. */
  byDay: boolean;
  hero: boolean;
  /** All images are loaded, so the last day's count is final. */
  complete: boolean;
}): GalleryRow[] {
  const { items, layout, width, size } = opts;
  const rows: GalleryRow[] = [];
  if (width <= 0) return rows;
  if (opts.hero) rows.push({ kind: "hero", key: "hero", height: HERO_H });
  const groups: Array<{ day: string; items: GalleryImage[] }> = [];
  if (opts.byDay) {
    for (const item of items) {
      const day = dayKey(item.mtime);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }
  } else if (items.length) {
    groups.push({ day: "", items });
  }
  groups.forEach((g, gi) => {
    if (opts.byDay)
      rows.push({
        kind: "header",
        key: `h-${g.day}`,
        height: HEADER_H,
        day: g.day,
        count: gi < groups.length - 1 || opts.complete ? g.items.length : null,
      });
    imageRows(g.items, layout, width, size).forEach((r, ri) => {
      const h = r[0]?.height ?? size;
      rows.push({
        kind: "images",
        key: `${g.day}-${ri}-${r[0]?.item.id}`,
        height: h + GAP,
        items: r,
      });
    });
  });
  return rows;
}

/** "Today", "Yesterday", "Sunday, October 12" or "October 12, 2025". */
export function dayLabel(day: string, now = new Date()): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: diff < 7 ? "long" : undefined,
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
