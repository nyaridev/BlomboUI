/**
 * Generate's tab under the prompts (Generation, Checkpoints, LoRAs…) and the strip tile a picker
 * is changing. A store, so Alt+1… (app/commands.ts) can switch tabs from anywhere. Changing the
 * tab any other way than from a strip tile forgets the tile.
 */
import type { WorkTab } from "@shared/constants";
import { create } from "zustand";
import type { StripTarget } from "./blocks/ModelsStrip";

export const useWorkTab = create<{
  tab: WorkTab;
  target: StripTarget | null;
  show: (tab: WorkTab) => void;
  /** A strip tile picked: change it in `tab` (or stay where we are). */
  pick: (target: StripTarget | null, tab?: WorkTab) => void;
}>((set) => ({
  tab: "generation",
  target: null,
  show: (tab) => set({ tab, target: null }),
  pick: (target, tab) => set((s) => ({ target, tab: tab ?? s.tab })),
}));
