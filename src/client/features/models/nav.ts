/**
 * Which Models tab is open, and the deep links into it from elsewhere: History's "Show in
 * Models" selects a local file, a local model's "Civitai page" and History's browse list open a
 * Civitai model tab. The opened Civitai tabs live in civitai/state.ts. The open tab is remembered
 * in this window (localStorage).
 */
import type { StoreCategory } from "@shared/manager";
import { create } from "zustand";

export type ModelsTab = "local" | "civitai" | "manager" | "wildcards";
const TABS: ModelsTab[] = ["local", "civitai", "manager", "wildcards"];
/** Models → Wildcards: the cards (view) or the file editor. */
export type WildcardsPage = "view" | "editor";
const KEY = "blombo.modelsTab";

function savedTab(): ModelsTab {
  try {
    const t = localStorage.getItem(KEY);
    return TABS.find((x) => x === t) ?? "local";
  } catch {
    return "local";
  }
}

interface ModelsNav {
  tab: ModelsTab;
  /** A local model to select in Models → Local (taken once by the view). */
  select: string | null;
  /** A Manager category and search to show (taken once by the store). */
  manager: { category: StoreCategory; query: string } | null;
  wildcards: WildcardsPage;
  setTab: (tab: ModelsTab) => void;
  setWildcardsPage: (page: WildcardsPage) => void;
  /** Open Models → Wildcards (on a page). */
  showWildcards: (page?: WildcardsPage) => void;
  showLocal: (id: string) => void;
  showManager: (category: StoreCategory, query?: string) => void;
  takeSelect: () => string | null;
  takeManager: () => { category: StoreCategory; query: string } | null;
}

export const useModelsNav = create<ModelsNav>((set, get) => ({
  tab: savedTab(),
  select: null,
  manager: null,
  wildcards: "view",
  setTab: (tab) => set({ tab }),
  setWildcardsPage: (wildcards) => set({ wildcards }),
  showWildcards: (page) => set({ tab: "wildcards", ...(page ? { wildcards: page } : {}) }),
  showLocal: (id) => set({ tab: "local", select: id }),
  showManager: (category, query = "") => set({ tab: "manager", manager: { category, query } }),
  takeManager: () => {
    const m = get().manager;
    if (m) set({ manager: null });
    return m;
  },
  takeSelect: () => {
    const id = get().select;
    if (id) set({ select: null });
    return id;
  },
}));

useModelsNav.subscribe((s, prev) => {
  if (s.tab === prev.tab) return;
  try {
    localStorage.setItem(KEY, s.tab);
  } catch {
    // Storage can be unavailable; the tab still holds for this session.
  }
});
