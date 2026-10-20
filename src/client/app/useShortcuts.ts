/**
 * App-wide keyboard shortcuts (mounted once in Shell). Keys come from the defaults in
 * shared/shortcuts.ts with the profile's overrides (Settings → Shortcuts). A combo without a
 * modifier (R, ?) is ignored while typing; one with Ctrl or a function key works anywhere, unless
 * the focused editor already handled it (the prompt editor's own Ctrl+Enter).
 */
import { useGoToView } from "@client/lib/hooks";
import { useSettings } from "@client/lib/queries";
import { comboFromEvent, comboParts, resolveShortcuts, worksWhileTyping } from "@shared/shortcuts";
import { useEffect, useMemo, useRef } from "react";
import { runAction } from "./commands";

/** Shortcuts stop while a dialog that records keys is open (Settings → Shortcuts). */
let paused = 0;
export function pauseShortcuts(): () => void {
  paused++;
  return () => {
    paused--;
  };
}

export function useShortcuts(): void {
  const overrides = useSettings().data?.shortcuts.overrides;
  const go = useGoToView();
  const goRef = useRef(go);
  goRef.current = go;
  // combo → action
  const byCombo = useMemo(() => {
    const map = new Map<string, string>();
    for (const [action, combo] of resolveShortcuts(overrides ?? []))
      if (combo && !map.has(combo)) map.set(combo, action);
    return map;
  }, [overrides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused > 0 || e.defaultPrevented || e.repeat) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const action = byCombo.get(combo);
      if (!action) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      const typing = Boolean(
        t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)),
      );
      if (typing && !worksWhileTyping(combo)) return;
      // Inside a dialog only the palette toggle and Help work; the rest belongs to the dialog.
      if (t?.closest("[role=dialog]") && action !== "palette" && action !== "view.help") return;
      if (runAction(action, goRef.current)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [byCombo]);
}

/** "Ctrl K" for an action's current keys (for tooltips and menus), or undefined. */
export function useShortcutLabel(): (action: string) => string | undefined {
  const overrides = useSettings().data?.shortcuts.overrides;
  const keys = useMemo(() => resolveShortcuts(overrides ?? []), [overrides]);
  return (action) => {
    const parts = comboParts(keys.get(action) ?? "");
    return parts.length ? parts.join(" ") : undefined;
  };
}
