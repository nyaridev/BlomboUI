/** Which Settings page is open; other views deep-link here ("Install ComfyUI" in the header). */
import type { IconName } from "@client/icons/Icon";
import { create } from "zustand";

export type SettingsPage =
  | "overview"
  | "appearance"
  | "interface"
  | "generate"
  | "saving"
  | "files"
  | "leftovers"
  | "gallery"
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
    keywords: "stats usage images gpu time name rename picture avatar",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "palette",
    group: "Profile",
    keywords: "theme color accent font motion contrast",
  },
  {
    id: "interface",
    label: "Interface",
    icon: "layout-rows",
    group: "Profile",
    keywords:
      "header tabs order hide reorder generate tabs number keys ctrl alt card size start open on labels icons",
  },
  {
    id: "files",
    label: "Folders",
    icon: "folder",
    group: "Profile",
    keywords: "models outputs wildcards paths",
  },
  {
    id: "leftovers",
    label: "Leftovers",
    icon: "eraser",
    group: "Profile",
    keywords: "cleanup clean unused orphan thumbnails pictures info favorites trash",
  },
  {
    id: "generate",
    label: "Generate",
    icon: "generate",
    group: "Tools",
    keywords: "layout default tour weight step preview samplers schedulers resolutions",
  },
  {
    id: "saving",
    label: "Saving",
    icon: "save",
    group: "Tools",
    keywords:
      "format png jpeg jpg webp quality copy file names folders paths placeholders grids batch interrupted",
  },
  {
    id: "gallery",
    label: "Gallery",
    icon: "gallery",
    group: "Tools",
    keywords: "tiles justified grid grids libraries exclude interrupted stopped",
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
    keywords: "tags suggestions lora wildcards frequent",
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
