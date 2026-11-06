/**
 * What the app can do from anywhere: the shortcut actions (shared/shortcuts.ts) and the
 * command palette's static entries run through here, so a key, a palette pick and a header
 * button do the same thing. Views are opened with the `go` function the caller gets from
 * `useGoToView()`, which keeps this module free of the router.
 */

import { cancelAll, generate, interrupt } from "@client/features/generate/actions";
import { useValues } from "@client/features/generate/state";
import { useWorkTab } from "@client/features/generate/worktab";
import { type SettingsPage, useSettingsNav } from "@client/features/settings/nav";
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { ViewId } from "@shared/constants";
import {
  generateTabs,
  headerTabs,
  type Settings,
  tabForNumber,
  UiSettings,
} from "@shared/settings";
import { SHORTCUT_ACTIONS, type ShortcutAction } from "@shared/shortcuts";
import { create } from "zustand";
import { useModelsNav } from "../features/models/nav";

export type Go = (view: ViewId) => void;

/** The command palette's open state (Ctrl+K, the header). */
export const usePalette = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

/** Run something and say how it went in a toast. */
export async function runWithToast(action: () => Promise<unknown>, done: string): Promise<void> {
  try {
    await action();
    toast(done, "success");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
  }
}

export const unloadModels = () =>
  runWithToast(
    () => api.comfyFree({ unloadModels: true, freeMemory: false }),
    "Models unloaded from VRAM",
  );

export const freeMemory = () =>
  runWithToast(
    () => api.comfyFree({ unloadModels: true, freeMemory: true }),
    "Memory and cache freed",
  );

export const rescanModels = () =>
  runWithToast(async () => {
    await api.comfyRefresh();
    await queryClient.invalidateQueries({ queryKey: qk.modelsAll });
    await queryClient.invalidateQueries({ queryKey: ["workflow"] });
    await queryClient.invalidateQueries({ queryKey: ["local-models"] });
  }, "Model lists refreshed");

export function openSettings(go: Go, page: SettingsPage): void {
  useSettingsNav.getState().go(page);
  go("settings");
}

/** The open profile's arrangement of tabs (Settings → Interface). */
function currentUi(): UiSettings {
  const key = qk.settings(useSession.getState().profileId);
  return queryClient.getQueryData<Settings>(key)?.ui ?? UiSettings.parse({});
}

/** Ctrl+1… and Alt+1…: the tab in that place, as Settings → Interface arranges them. */
function openTab(tab: NonNullable<ShortcutAction["tab"]>, go: Go): boolean {
  const ui = currentUi();
  if (tab.of === "header") {
    const view = tabForNumber(headerTabs(ui), tab.n, ui.numberKeysSkipHidden);
    if (view) go(view);
    return view !== null;
  }
  const work = tabForNumber(generateTabs(ui), tab.n, ui.numberKeysSkipHidden);
  if (!work) return false;
  useWorkTab.getState().show(work);
  go("generate");
  return true;
}

/** Run a shortcut action by id. Returns false for an unknown id. */
export function runAction(id: string, go: Go): boolean {
  const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
  if (!action) return false;
  if (action.tab) return openTab(action.tab, go);
  if (action.view) {
    go(action.view);
    return true;
  }
  switch (id) {
    case "view.wildcards":
      useModelsNav.getState().showWildcards();
      go("models");
      return true;
    case "generate":
      // Nothing loaded yet (Generate never opened in this window): show it instead.
      if (!useValues.getState().workflowId) go("generate");
      else void generate();
      return true;
    case "interrupt":
      void interrupt();
      return true;
    case "cancel":
      void cancelAll();
      return true;
    case "palette":
      usePalette.getState().set(!usePalette.getState().open);
      return true;
    case "shortcuts":
      openSettings(go, "shortcuts");
      return true;
    case "rescan":
      void rescanModels();
      return true;
    case "unload":
      void unloadModels();
      return true;
    case "free":
      void freeMemory();
      return true;
  }
  return false;
}
