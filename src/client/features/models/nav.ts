/**
 * Which Models tab is open, and the deep links into it from elsewhere: History's "Show in
 * Models" selects a local file, a local model's "Civitai page" and History's browse list open a
 * Civitai model tab. The opened Civitai tabs live in civitai/state.ts.
 */
import type { StoreCategory } from "@shared/manager";
import { create } from "zustand";

export type ModelsTab = "local" | "civitai" | "manager" | "scopes";

interface ModelsNav {
  tab: ModelsTab;
  /** A local model to select in Models → Local (taken once by the view). */
  select: string | null;
  /** A Manager category and search to show (taken once by the store). */
  manager: { category: StoreCategory; query: string } | null;
  setTab: (tab: ModelsTab) => void;
  showLocal: (id: string) => void;
  showManager: (category: StoreCategory, query?: string) => void;
  takeSelect: () => string | null;
  takeManager: () => { category: StoreCategory; query: string } | null;
}

export const useModelsNav = create<ModelsNav>((set, get) => ({
  tab: "local",
  select: null,
  manager: null,
  setTab: (tab) => set({ tab }),
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
