/**
 * Model pickers put your favorites first, then what you used most recently (from the job log),
 * then everything else in its usual order. Names are compared without folder case or extension
 * so a LoRA tag ("detail") matches its file ("style/detail.safetensors").
 */

const stem = (name: string) =>
  name
    .replace(/\\/g, "/")
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "")
    .toLowerCase();

const base = (name: string) => stem(name).split("/").pop() ?? "";

export type PickerSection = "favorite" | "recent" | null;

export function pickerOrder<T>(
  items: T[],
  name: (item: T) => string,
  favorites: Set<string>,
  recent: string[],
  recentLimit = 12,
): Array<{ item: T; section: PickerSection }> {
  const fav = new Set([...favorites].map(stem));
  const rank = new Map<string, number>();
  recent.slice(0, recentLimit).forEach((r, i) => {
    if (!rank.has(stem(r))) rank.set(stem(r), i);
    if (!rank.has(base(r))) rank.set(base(r), i);
  });
  const favs: T[] = [];
  const recents: Array<{ item: T; i: number }> = [];
  const rest: T[] = [];
  for (const item of items) {
    const n = name(item);
    if (fav.has(stem(n))) favs.push(item);
    else {
      const i = rank.get(stem(n)) ?? rank.get(base(n));
      if (i !== undefined) recents.push({ item, i });
      else rest.push(item);
    }
  }
  return [
    ...favs.map((item) => ({ item, section: "favorite" as const })),
    ...recents.sort((a, b) => a.i - b.i).map((r) => ({ item: r.item, section: "recent" as const })),
    ...rest.map((item) => ({ item, section: null })),
  ];
}
