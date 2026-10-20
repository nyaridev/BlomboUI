/** Which Settings page is open; other views deep-link here ("Install ComfyUI" in the header). */
import type { IconName } from "@client/icons/Icon";
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
  | "notifications"
  | "comfy"
  | "shortcuts"
  | "about";

/** The page rail, in order (the command palette lists the same pages). */
export const SETTINGS_PAGES: Array<{
  id: SettingsPage;
  label: string;
  icon: IconName;
  group: string;
  /** Words the settings search and the palette match besides the label. */
  keywords: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    icon: "gauge",
    group: "",
    keywords: "stats usage images gpu time",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "palette",
    group: "Profile",
    keywords: "theme color accent font motion nsfw blur",
  },
  {
    id: "files",
    label: "Folders",
    icon: "folder",
    group: "Profile",
    keywords: "models outputs wildcards paths",
  },
  {
    id: "generate",
    label: "Generate",
    icon: "generate",
    group: "Tools",
    keywords: "layout default prompt history tour",
  },
  {
    id: "gallery",
    label: "Gallery",
    icon: "gallery",
    group: "Tools",
    keywords: "tiles justified grid libraries",
  },
  {
    id: "models",
    label: "Models",
    icon: "models",
    group: "Tools",
    keywords: "nsfw blur thumbnails scopes",
  },
  {
    id: "civitai",
    label: "Civitai",
    icon: "globe",
    group: "Tools",
    keywords: "api key downloads folders history",
  },
  {
    id: "autocomplete",
    label: "Autocomplete",
    icon: "text",
    group: "Tools",
    keywords: "tags suggestions weight lora wildcards",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "bell",
    group: "System",
    keywords: "notify background finished windows",
  },
  {
    id: "comfy",
    label: "ComfyUI",
    icon: "workflow",
    group: "System",
    keywords: "install slot bridge restart",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: "keyboard",
    group: "System",
    keywords: "keys hotkeys keyboard rebind",
  },
  {
    id: "about",
    label: "About",
    icon: "info",
    group: "System",
    keywords: "version export import backup profile zip data folder",
  },
];

export const useSettingsNav = create<{ page: SettingsPage; go: (page: SettingsPage) => void }>(
  (set) => ({ page: "overview", go: (page) => set({ page }) }),
);
