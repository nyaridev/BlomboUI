/** Help topics (the view's sections, also listed in the command palette) and which one to show. */
import type { IconName } from "@client/icons/Icon";
import { create } from "zustand";

export const HELP_TOPICS: Array<{ id: string; title: string; icon: IconName; keywords: string }> = [
  {
    id: "start",
    title: "Getting started",
    icon: "sparkle",
    keywords: "first profile comfyui install generate",
  },
  {
    id: "models",
    title: "Loading models",
    icon: "models",
    keywords: "checkpoint lora vae folder civitai manager download",
  },
  {
    id: "workflows",
    title: "Importing and editing workflows",
    icon: "workflow",
    keywords: "import comfyui bridge edit save blombo png json",
  },
  {
    id: "stages",
    title: "Stages: Hires fix, ADetailer, ControlNet",
    icon: "layers",
    keywords: "hires adetailer controlnet face upscale",
  },
  {
    id: "batch",
    title: "Scripts and batch tools",
    icon: "stack",
    keywords: "xy plot matrix thumbnails batch caption upscale remove background",
  },
  {
    id: "prompts",
    title: "Prompt guide",
    icon: "text",
    keywords: "syntax weight emphasis lora wildcard break escape choice",
  },
  {
    id: "playground",
    title: "Prompt playground",
    icon: "edit",
    keywords: "try test prompt syntax",
  },
  { id: "keys", title: "Keyboard shortcuts", icon: "keyboard", keywords: "keys hotkeys" },
];

export const useHelpNav = create<{
  /** A topic to scroll to (taken once by the view). */
  topic: string | null;
  show: (topic: string) => void;
  take: () => string | null;
}>((set, get) => ({
  topic: null,
  show: (topic) => set({ topic }),
  take: () => {
    const t = get().topic;
    if (t) set({ topic: null });
    return t;
  },
}));
