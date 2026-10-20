/**
 * The command palette's contents (Ctrl+K): views, actions, workflows, models and LoRAs, Settings
 * pages and Help topics. Everything comes from data the app already has (TanStack Query caches,
 * the shortcut list); lists load the first time the palette opens.
 */
import { useActiveChoice } from "@client/features/generate/workflow";
import { HELP_TOPICS, useHelpNav } from "@client/features/help/nav";
import { useModelsNav } from "@client/features/models/nav";
import { SETTINGS_PAGES } from "@client/features/settings/nav";
import type { IconName } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { useLocalModels, useSettings, useWorkflows } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { CommandPalette, type PaletteItem } from "@client/ui/CommandPalette";
import { comboParts, resolveShortcuts, SHORTCUT_ACTIONS } from "@shared/shortcuts";
import { useMemo } from "react";
import { openSettings, runAction, usePalette } from "./commands";

const VIEW_ICONS: Record<string, IconName> = {
  "view.generate": "generate",
  "view.gallery": "gallery",
  "view.models": "models",
  "view.wildcards": "wildcards",
  "view.file-info": "file-info",
  "view.history": "history",
  "view.scopes": "scopes",
  "view.errors": "errors",
  "view.settings": "settings",
  "view.help": "book",
};
const ACTION_ICONS: Record<string, IconName> = {
  generate: "sparkle",
  interrupt: "skip",
  cancel: "stop",
  shortcuts: "keyboard",
  rescan: "rescan-models",
  unload: "unload-models",
  free: "free-cache",
};

export function Palette() {
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.set);
  const go = useGoToView();
  const profileId = useSession((s) => s.profileId);
  const choose = useActiveChoice((s) => s.choose);
  const overrides = useSettings().data?.shortcuts.overrides;
  const workflows = useWorkflows().data;
  // Model files load only once the palette has been opened.
  const models = useLocalModels(open).data?.models;

  const items = useMemo<PaletteItem[]>(() => {
    const keys = resolveShortcuts(overrides ?? []);
    const out: PaletteItem[] = [];
    for (const a of SHORTCUT_ACTIONS) {
      if (a.id === "palette") continue;
      const combo = comboParts(keys.get(a.id) ?? "");
      out.push({
        id: `action:${a.id}`,
        label: a.label,
        group: a.view ? "Go to" : "Actions",
        icon: VIEW_ICONS[a.id] ?? ACTION_ICONS[a.id] ?? "bolt",
        keys: combo.length ? [combo.join(" ")] : undefined,
      });
    }
    for (const w of workflows ?? [])
      out.push({
        id: `workflow:${w.id}`,
        label: w.name,
        group: "Workflows",
        icon: w.kind === "batch" ? "stack" : "workflow",
        hint: w.family,
        keywords: `${w.family} ${w.tags.join(" ")} workflow`,
      });
    for (const p of SETTINGS_PAGES)
      out.push({
        id: `settings:${p.id}`,
        label: `Settings → ${p.label}`,
        group: "Settings",
        icon: p.icon,
        keywords: p.keywords,
      });
    for (const t of HELP_TOPICS)
      out.push({
        id: `help:${t.id}`,
        label: t.title,
        group: "Help",
        icon: t.icon,
        keywords: t.keywords,
      });
    for (const m of models ?? []) {
      const lora = m.kind === "loras";
      if (m.kind !== "checkpoints" && m.kind !== "diffusion_models" && !lora) continue;
      out.push({
        id: `model:${m.id}`,
        label: m.name,
        group: lora ? "LoRAs" : "Models",
        thumb: m.nsfw ? null : m.thumb,
        icon: lora ? "layers" : "models",
        hint: m.baseModel ?? m.folder,
        keywords: `${m.file} ${m.folder} ${m.triggerWords.join(" ")}`,
      });
    }
    return out;
  }, [overrides, workflows, models]);

  const pick = (item: PaletteItem) => {
    const [type, ...rest] = item.id.split(":");
    const id = rest.join(":");
    if (type === "action") runAction(id, go);
    else if (type === "workflow") {
      if (profileId) choose(profileId, id);
      go("generate");
    } else if (type === "settings") openSettings(go, id as (typeof SETTINGS_PAGES)[number]["id"]);
    else if (type === "help") {
      useHelpNav.getState().show(id);
      go("help");
    } else if (type === "model") {
      useModelsNav.getState().showLocal(id);
      go("models");
    }
  };

  return <CommandPalette open={open} onOpenChange={setOpen} items={items} onPick={pick} />;
}
