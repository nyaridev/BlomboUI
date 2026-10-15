/** Which Settings page is open; other views deep-link here ("Install ComfyUI" in the header). */
import { create } from "zustand";

export type SettingsPage =
  | "overview"
  | "appearance"
  | "generate"
  | "files"
  | "gallery"
  | "models"
  | "civitai"
  | "autocomplete"
  | "comfy"
  | "shortcuts"
  | "about";

export const useSettingsNav = create<{ page: SettingsPage; go: (page: SettingsPage) => void }>(
  (set) => ({ page: "overview", go: (page) => set({ page }) }),
);
