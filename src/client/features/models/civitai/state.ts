/**
 * The Civitai browser's UI state: the applied filter (seeded from Settings → Civitai's browse
 * defaults the first time) and the opened model tabs. Server data stays in TanStack Query.
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
  /** Use the profile's defaults (once, before the first search). */
  seed: (browse: Settings["civitai"]["browse"]) => void;
  setFilter: (patch: Partial<BrowseFilterInput>) => void;
  replaceFilter: (filter: BrowseFilter) => void;
  open: (id: number, name: string) => void;
  close: (id: number) => void;
  show: (id: number | null) => void;
}

const MAX_TABS = 12;

export const useCivitai = create<CivitaiState>((set, get) => ({
  filter: null,
  tabs: [],
  active: null,
  seed: (browse) => {
    if (!get().filter) set({ filter: BrowseFilter.parse(browse) });
  },
  setFilter: (patch) =>
    set((s) => ({ filter: BrowseFilter.parse({ ...(s.filter ?? {}), ...patch }) })),
  replaceFilter: (filter) => set({ filter }),
  open: (id, name) =>
    set((s) => {
      const tabs = s.tabs.some((t) => t.id === id)
        ? s.tabs.map((t) => (t.id === id ? { id, name } : t))
        : [...s.tabs, { id, name }].slice(-MAX_TABS);
      return { tabs, active: id };
    }),
  close: (id) =>
    set((s) => {
      const at = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const active = s.active === id ? (tabs[Math.min(at, tabs.length - 1)]?.id ?? null) : s.active;
      return { tabs, active };
    }),
  show: (id) => set({ active: id }),
}));

/** Open a Civitai model in its tab, from anywhere (switches Models to the Civitai tab). */
export function openCivitaiModel(id: number, name: string): void {
  useCivitai.getState().open(id, name);
  useModelsNav.getState().setTab("civitai");
}
