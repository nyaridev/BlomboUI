/**
 * Which Models tab is open, and the deep links into it from elsewhere: History's "Show in
 * Models" selects a local file, a local model's "Civitai page" and History's browse list open a
 * Civitai model tab. The opened Civitai tabs live in civitai/state.ts.
 */
import { create } from "zustand";

export type ModelsTab = "local" | "civitai" | "manager";

interface ModelsNav {
  tab: ModelsTab;
  /** A local model to select in Models → Local (taken once by the view). */
  select: string | null;
  setTab: (tab: ModelsTab) => void;
  showLocal: (id: string) => void;
  takeSelect: () => string | null;
}

export const useModelsNav = create<ModelsNav>((set, get) => ({
  tab: "local",
  select: null,
  setTab: (tab) => set({ tab }),
  showLocal: (id) => set({ tab: "local", select: id }),
  takeSelect: () => {
    const id = get().select;
    if (id) set({ select: null });
    return id;
  },
}));
