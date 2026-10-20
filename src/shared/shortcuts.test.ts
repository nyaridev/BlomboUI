import { describe, expect, it } from "vitest";
import {
  comboFromEvent,
  comboParts,
  normalizeCombo,
  resolveShortcuts,
  SHORTCUT_ACTIONS,
  setShortcut,
  shortcutConflicts,
  worksWhileTyping,
} from "./shortcuts.ts";

const key = (
  k: string,
  mods: Partial<Record<"ctrl" | "shift" | "alt" | "meta", boolean>> = {},
) => ({
  key: k,
  ctrlKey: Boolean(mods.ctrl),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
  metaKey: Boolean(mods.meta),
});

describe("shortcuts", () => {
  it("turns key presses into combos", () => {
    expect(comboFromEvent(key("k", { ctrl: true }))).toBe("Ctrl+K");
    expect(comboFromEvent(key("K", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+K");
    expect(comboFromEvent(key("Enter", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+Enter");
    expect(comboFromEvent(key("?", { shift: true }))).toBe("?");
    expect(comboFromEvent(key(",", { ctrl: true }))).toBe("Ctrl+,");
    expect(comboFromEvent(key("1", { meta: true }))).toBe("Ctrl+1");
    expect(comboFromEvent(key("F1"))).toBe("F1");
    expect(comboFromEvent(key("Control", { ctrl: true }))).toBeNull();
    expect(comboFromEvent(key("Unidentified"))).toBeNull();
  });

  it("normalizes and splits combos", () => {
    expect(normalizeCombo("shift+ctrl+k")).toBe("Ctrl+Shift+K");
    expect(normalizeCombo("cmd+enter")).toBe("Ctrl+Enter");
    expect(normalizeCombo("Ctrl++")).toBe("Ctrl++");
    expect(normalizeCombo("")).toBe("");
    expect(comboParts("Ctrl+ArrowUp")).toEqual(["Ctrl", "↑"]);
    expect(worksWhileTyping("Ctrl+K")).toBe(true);
    expect(worksWhileTyping("F1")).toBe(true);
    expect(worksWhileTyping("R")).toBe(false);
  });

  it("applies overrides and finds conflicts", () => {
    const defaults = resolveShortcuts([]);
    expect(defaults.get("palette")).toBe("Ctrl+K");
    expect(shortcutConflicts(defaults).size).toBe(0);
    let overrides = setShortcut([], "palette", "Ctrl+1");
    expect(overrides).toEqual([{ action: "palette", keys: "Ctrl+1" }]);
    const bound = resolveShortcuts(overrides);
    expect(shortcutConflicts(bound).get("Ctrl+1")).toEqual(["view.generate", "palette"]);
    // Back to the default: the override goes away.
    overrides = setShortcut(overrides, "palette", "ctrl+k");
    expect(overrides).toEqual([]);
    // Unknown actions in old settings are ignored.
    expect(resolveShortcuts([{ action: "gone", keys: "X" }]).has("gone")).toBe(false);
  });

  it("has unique action ids and no default conflicts", () => {
    const ids = SHORTCUT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
