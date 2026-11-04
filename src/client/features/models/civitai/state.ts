/**
 * The Civitai browser's UI state: the applied filter (seeded from Settings → Civitai's browse
 * defaults the first time), the opened model tabs, and whether NSFW images are blurred (this
 * view only, on each time the app starts). The filter and the tabs are remembered in this window
 * (localStorage), so a reload or a restart comes back to them. Server data stays in TanStack Query.
 */
import { BrowseFilter, type BrowseFilterInput } from "@shared/civitai";
import type { Settings } from "@shared/settings";
import { create } from "zustand";
import { useModelsNav } from "../nav";

export interface OpenTab {
  id: number;
  name: string;
}

interface CivitaiState {
  filter: BrowseFilter | null;
  tabs: OpenTab[];
  /** The model tab in front; null shows the browser. */
  active: number | null;
  /** NSFW images stay blurred until clicked (the NSFW button switches it for every image). */
  blur: boolean;
  toggleBlur: () => void;
  /** Use the profile's defaults (once, before the first search). */
  seed: (browse: Settings["civitai"]["browse"]) => void;
  setFilter: (patch: Partial<BrowseFilterInput>) => void;
  replaceFilter: (filter: BrowseFilter) => void;
  /** Open a model's tab; `background` adds it without leaving what's in front (a middle click). */
  open: (id: number, name: string, background?: boolean) => void;
  close: (id: number) => void;
  closeAll: () => void;
  show: (id: number | null) => void;
}

const MAX_TABS = 12;
const KEY = "blombo.civitai";

type Saved = Pick<CivitaiState, "filter" | "tabs" | "active">;

/** What was saved, as far as it's still valid: a bad filter is dropped, bad tabs are skipped. */
export function readSaved(raw: unknown): Saved {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const filter = BrowseFilter.safeParse(o.filter);
  const tabs = (Array.isArray(o.tabs) ? o.tabs : [])
    .filter(
      (t): t is OpenTab =>
        Number.isInteger(t?.id) && t.id > 0 && typeof t.name === "string" && t.name.length > 0,
    )
    .map((t) => ({ id: t.id, name: t.name.slice(0, 200) }))
    .slice(-MAX_TABS);
  const active = tabs.some((t) => t.id === o.active) ? (o.active as number) : null;
  return { filter: o.filter && filter.success ? filter.data : null, tabs, active };
}

function load(): Saved {
  try {
    return readSaved(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return readSaved({});
  }
}

export const useCivitai = create<CivitaiState>((set, get) => ({
  ...load(),
  blur: true,
  toggleBlur: () => set((s) => ({ blur: !s.blur })),
  seed: (browse) => {
    if (!get().filter) set({ filter: BrowseFilter.parse(browse) });
  },
  setFilter: (patch) =>
    set((s) => ({ filter: BrowseFilter.parse({ ...(s.filter ?? {}), ...patch }) })),
  replaceFilter: (filter) => set({ filter }),
  open: (id, name, background = false) =>
    set((s) => {
      const tabs = s.tabs.some((t) => t.id === id)
        ? s.tabs.map((t) => (t.id === id ? { id, name } : t))
        : [...s.tabs, { id, name }].slice(-MAX_TABS);
      const active = background ? s.active : id;
      return { tabs, active: tabs.some((t) => t.id === active) ? active : null };
    }),
  closeAll: () => set({ tabs: [], active: null }),
  close: (id) =>
    set((s) => {
      const at = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const active = s.active === id ? (tabs[Math.min(at, tabs.length - 1)]?.id ?? null) : s.active;
      return { tabs, active };
    }),
  show: (id) => set({ active: id }),
}));

useCivitai.subscribe((s, prev) => {
  if (s.filter === prev.filter && s.tabs === prev.tabs && s.active === prev.active) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ filter: s.filter, tabs: s.tabs, active: s.active }));
  } catch {
    // Storage can be unavailable; the state still holds for this session.
  }
});

/** Open a Civitai model in its tab, from anywhere (switches Models to the Civitai tab). */
export function openCivitaiModel(id: number, name: string): void {
  useCivitai.getState().open(id, name);
  useModelsNav.getState().setTab("civitai");
}
