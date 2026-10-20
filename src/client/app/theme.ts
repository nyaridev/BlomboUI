/**
 * Theme, accent and UI font live on <html data-theme data-accent data-font>. The open profile
 * decides theme and accent, its settings decide the font; the profile screen and the Design Lab
 * can preview others without saving.
 */
import type { AccentId, ThemeId } from "@shared/constants";
import { fontStack, type MotionPref, type UiFont } from "@shared/settings";
import { useEffect } from "react";
import { create } from "zustand";

interface ThemeState {
  theme: ThemeId;
  accent: AccentId;
  font: UiFont;
  /** Family name for the "custom" font. */
  customFont: string;
  motion: MotionPref;
  set: (
    patch: Partial<Pick<ThemeState, "theme" | "accent" | "font" | "customFont" | "motion">>,
  ) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: "blombo",
  accent: "blue",
  font: "geist",
  customFont: "",
  motion: "system",
  set: (patch) => set(patch),
}));

/** Mount once at the root: mirrors the theme store onto <html>. */
export function useApplyTheme() {
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  const font = useTheme((s) => s.font);
  const customFont = useTheme((s) => s.customFont);
  const motion = useTheme((s) => s.motion);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);
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
