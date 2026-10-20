/**
 * Keyboard shortcuts: every app-wide action with its default keys, plus the keys that belong to
 * one view (listed so Settings → Shortcuts shows everything, but not rebindable). Overrides are
 * saved in settings (`shortcuts.overrides`). Combos are written "Ctrl+Shift+K"; a printable
 * symbol carries its own Shift ("?", not "Shift+/").
 */
import type { ViewId } from "./constants.ts";

export const SHORTCUT_GROUPS = ["Views", "Generate", "App", "ComfyUI"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export interface ShortcutAction {
  id: string;
  label: string;
  group: ShortcutGroup;
  keys: string;
  /** Opens a view (the palette lists it there too). */
  view?: ViewId;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "view.generate",
    label: "Go to Generate",
    group: "Views",
    keys: "Ctrl+1",
    view: "generate",
  },
  { id: "view.gallery", label: "Go to Gallery", group: "Views", keys: "Ctrl+2", view: "gallery" },
  { id: "view.models", label: "Go to Models", group: "Views", keys: "Ctrl+3", view: "models" },
  {
    id: "view.wildcards",
    label: "Go to Wildcards",
    group: "Views",
    keys: "Ctrl+4",
    view: "wildcards",
  },
  {
    id: "view.file-info",
    label: "Go to File Info",
    group: "Views",
    keys: "Ctrl+5",
    view: "file-info",
  },
  { id: "view.history", label: "Go to History", group: "Views", keys: "Ctrl+6", view: "history" },
  { id: "view.scopes", label: "Go to Scopes", group: "Views", keys: "Ctrl+7", view: "scopes" },
  { id: "view.errors", label: "Go to Errors", group: "Views", keys: "Ctrl+8", view: "errors" },
  { id: "view.settings", label: "Open Settings", group: "Views", keys: "Ctrl+,", view: "settings" },
  { id: "view.help", label: "Open Help", group: "Views", keys: "F1", view: "help" },
  { id: "generate", label: "Generate", group: "Generate", keys: "Ctrl+Enter" },
  { id: "interrupt", label: "Stop this image", group: "Generate", keys: "Ctrl+Shift+Enter" },
  { id: "cancel", label: "Cancel and clear the queue", group: "Generate", keys: "" },
  { id: "palette", label: "Command palette", group: "App", keys: "Ctrl+K" },
  { id: "shortcuts", label: "Show keyboard shortcuts", group: "App", keys: "?" },
  { id: "rescan", label: "Rescan model folders", group: "ComfyUI", keys: "R" },
  { id: "unload", label: "Unload models from VRAM", group: "ComfyUI", keys: "" },
  { id: "free", label: "Free memory and node cache", group: "ComfyUI", keys: "" },
];

/** Keys that work inside one view; shown in the list, not rebindable. */
export const FIXED_SHORTCUTS: Array<{ label: string; where: string; keys: string }> = [
  { label: "Suggestions", where: "Prompt editor", keys: "Ctrl+Space" },
  { label: "Weight up / down", where: "Prompt editor", keys: "Ctrl+↑ / Ctrl+↓" },
  { label: "Previous / next image", where: "Lightbox", keys: "← / →" },
  { label: "Favorite", where: "Lightbox", keys: "F" },
  { label: "Rate 1–5 stars (0 clears)", where: "Lightbox", keys: "1–5 / 0" },
  { label: "Zoom to 100%", where: "Lightbox", keys: "Z" },
  { label: "Move to trash", where: "Lightbox", keys: "Delete" },
  { label: "Close", where: "Lightbox, dialogs, palette", keys: "Escape" },
  { label: "Save", where: "Wildcards", keys: "Ctrl+S" },
  { label: "Undo / redo", where: "Customize", keys: "Ctrl+Z / Ctrl+Y" },
  { label: "Open a profile", where: "Profile screen", keys: "1–9" },
];

const MOD_ORDER = ["Ctrl", "Alt", "Shift"] as const;
const NAMED: Record<string, string> = {
  " ": "Space",
  Esc: "Escape",
  Escape: "Escape",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/** "enter" → "Enter", "f1" → "F1"; unknown names pass through. */
function namedKey(name: string): string {
  if (/^f\d{1,2}$/i.test(name)) return name.toUpperCase();
  const found = Object.values(NAMED).find((v) => v.toLowerCase() === name.toLowerCase());
  return found ?? (name.toLowerCase() === "esc" ? "Escape" : name);
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** The combo a key press makes ("Ctrl+K"), or null for a lone modifier. */
export function comboFromEvent(e: KeyLike): string | null {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"].includes(e.key)) return null;
  let key = NAMED[e.key] ?? e.key;
  if (/^F\d{1,2}$/.test(key)) {
    // function keys as they are
  } else if (key.length === 1) {
    key = key.toUpperCase();
  } else if (!NAMED[e.key]) return null;
  const printableSymbol = key.length === 1 && !/[A-Z0-9]/.test(key);
  const mods: string[] = [];
  // Cmd counts as Ctrl, so the same combos work on a Mac keyboard.
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey && !printableSymbol) mods.push("Shift");
  return [...mods, key].join("+");
}

/** A combo in the canonical form ("shift+ctrl+k" → "Ctrl+Shift+K"), or "" when it's empty. */
export function normalizeCombo(combo: string): string {
  const raw = combo.trim();
  if (!raw) return "";
  // "+" itself may be the key ("Ctrl++").
  const parts = raw.endsWith("++") ? [...raw.slice(0, -2).split("+"), "+"] : raw.split("+");
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    const t = p.trim();
    const lower = t.toLowerCase();
    if (lower === "ctrl" || lower === "control" || lower === "cmd" || lower === "meta")
      mods.add("Ctrl");
    else if (lower === "alt" || lower === "option") mods.add("Alt");
    else if (lower === "shift") mods.add("Shift");
    else key = t.length === 1 ? t.toUpperCase() : namedKey(t);
  }
  if (!key) return "";
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** Keys for display: "Ctrl+Shift+K" → ["Ctrl", "Shift", "K"] with arrows as symbols. */
export function comboParts(combo: string): string[] {
  const n = normalizeCombo(combo);
  if (!n) return [];
  const parts = n.endsWith("++") ? [...n.slice(0, -2).split("+"), "+"] : n.split("+");
  const pretty: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
  };
  return parts.map((p) => pretty[p] ?? p);
}

/** Has a modifier or is a function key: works even while typing in a field. */
export function worksWhileTyping(combo: string): boolean {
  const n = normalizeCombo(combo);
  return n.startsWith("Ctrl+") || n.startsWith("Alt+") || /^F\d{1,2}$/.test(n) || n === "Escape";
}

/** The keys each action uses, defaults with the saved overrides applied. */
export function resolveShortcuts(
  overrides: Array<{ action: string; keys: string }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of SHORTCUT_ACTIONS) out.set(a.id, normalizeCombo(a.keys));
  for (const o of overrides) if (out.has(o.action)) out.set(o.action, normalizeCombo(o.keys));
  return out;
}

/** Actions that share a combo with another action: combo → action ids. */
export function shortcutConflicts(bindings: Map<string, string>): Map<string, string[]> {
  const byCombo = new Map<string, string[]>();
  for (const [action, combo] of bindings) {
    if (!combo) continue;
    byCombo.set(combo, [...(byCombo.get(combo) ?? []), action]);
  }
  for (const [combo, ids] of byCombo) if (ids.length < 2) byCombo.delete(combo);
  return byCombo;
}

/** The overrides list after setting one action's keys (dropping it when it's the default). */
export function setShortcut(
  overrides: Array<{ action: string; keys: string }>,
  action: string,
  keys: string,
): Array<{ action: string; keys: string }> {
  const def = SHORTCUT_ACTIONS.find((a) => a.id === action);
  const rest = overrides.filter((o) => o.action !== action);
  const n = normalizeCombo(keys);
  return def && normalizeCombo(def.keys) === n ? rest : [...rest, { action, keys: n }];
}
