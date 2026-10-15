/**
 * Theme + accent live on <html data-theme data-accent>. The open profile decides both; the
 * profile screen and the Design Lab can preview others without saving.
 */
import type { AccentId, ThemeId } from "@shared/constants";
import { useEffect } from "react";
import { create } from "zustand";

interface ThemeState {
  theme: ThemeId;
  accent: AccentId;
  set: (patch: Partial<Pick<ThemeState, "theme" | "accent">>) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: "blombo",
  accent: "blue",
  set: (patch) => set(patch),
}));

/** Mount once at the root: mirrors the theme store onto <html>. */
export function useApplyTheme() {
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.style.colorScheme = theme === "light" ? "light" : "dark";
  }, [theme, accent]);
}
