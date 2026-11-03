/**
 * Theme, accent, UI font and contrast live on <html data-theme data-accent data-font
 * data-contrast>. The open profile decides theme and accent, its settings decide the font and
 * contrast; the profile screen and the Design Lab
 * can preview others without saving.
 */
import type { AccentId, ThemeId } from "@shared/constants";
import { DEFAULT_UI_FONT, fontStack, type MotionPref, type UiFont } from "@shared/settings";
import { useEffect } from "react";
import { create } from "zustand";

interface ThemeState {
  theme: ThemeId;
  accent: AccentId;
  font: UiFont;
  /** Family name for the "custom" font. */
  customFont: string;
  motion: MotionPref;
  /** High contrast: `data-contrast="high"` swaps in stronger tokens (tokens.css). */
  contrast: boolean;
  set: (
    patch: Partial<
      Pick<ThemeState, "theme" | "accent" | "font" | "customFont" | "motion" | "contrast">
    >,
  ) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: "blombo",
  accent: "blue",
  font: DEFAULT_UI_FONT,
  customFont: "",
  motion: "system",
  contrast: false,
  set: (patch) => set(patch),
}));

/** Mount once at the root: mirrors the theme store onto <html>. */
export function useApplyTheme() {
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  const font = useTheme((s) => s.font);
  const customFont = useTheme((s) => s.customFont);
  const motion = useTheme((s) => s.motion);
  const contrast = useTheme((s) => s.contrast);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);
  useEffect(() => {
    if (contrast) document.documentElement.dataset.contrast = "high";
    else delete document.documentElement.dataset.contrast;
  }, [contrast]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme, accent]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.font = font;
    const stack = fontStack(font, customFont);
    if (stack) root.style.setProperty("--font-ui", stack);
    else root.style.removeProperty("--font-ui");
  }, [font, customFont]);
}
