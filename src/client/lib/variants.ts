/**
 * Layout variants, for trying designs side by side in dev mode. A component asks
 * `useVariant(key, label, options)` which one to render; the dev panel
 * (`features/dev/VariantPanel.tsx`) lists the variants on screen and switches them. Built apps
 * always get the first option. Once one is picked, the call and the other layouts are deleted.
 */
import { useEffect } from "react";
import { create } from "zustand";

export interface VariantOption<T extends string = string> {
  id: T;
  label: string;
}

interface Variants {
  /** Variants whose component is mounted right now. */
  onScreen: Record<string, { label: string; options: readonly VariantOption[] }>;
  picked: Record<string, string>;
  pick: (key: string, id: string) => void;
}

const STORAGE = "blombo.dev.variants";

function readPicked(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export const useVariants = create<Variants>((set) => ({
  onScreen: {},
  picked: import.meta.env.DEV ? readPicked() : {},
  pick: (key, id) =>
    set((s) => {
      const picked = { ...s.picked, [key]: id };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(picked));
      } catch {
        // The choice just won't survive a reload.
      }
      return { picked };
    }),
}));

/** Which of `options` to render. Keep `options` a module constant. */
export function useVariant<T extends string>(
  key: string,
  label: string,
  options: readonly [VariantOption<T>, ...VariantOption<T>[]],
): T {
  const picked = useVariants((s) => s.picked[key]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    useVariants.setState((s) => ({ onScreen: { ...s.onScreen, [key]: { label, options } } }));
    return () =>
      useVariants.setState((s) => {
        const { [key]: _, ...rest } = s.onScreen;
        return { onScreen: rest };
      });
  }, [key, label, options]);
  return (import.meta.env.DEV && options.find((o) => o.id === picked)?.id) || options[0].id;
}
