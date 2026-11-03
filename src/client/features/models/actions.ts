/**
 * What you can do with a local model from anywhere: the model info dialog, favorites, Explorer,
 * File Info and its Civitai page, and the right-click menu built from them (`useModelMenu`),
 * shared by Models → Local and the Generate pickers.
 */
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useModelMarks, useSetModelFavorite } from "@client/lib/queries";
import { type MenuEntry, toast } from "@client/ui";
import { comfyNameOf, type LocalModel, modelKey } from "@shared/models";
import { create } from "zustand";
import { useFileInfoTarget } from "../fileinfo/state";
import { openCivitaiModel } from "./civitai/state";

/** Which model the info dialog shows (ModelInfoDialog, mounted in Shell). */
export const useModelInfo = create<{ id: string | null }>(() => ({ id: null }));

/** Open the model info dialog for a local model (its id: "loras/style/foo.safetensors"). */
export function openModelInfo(id: string): void {
  useModelInfo.setState({ id });
}

export function useModelActions() {
  const go = useGoToView();
  const setTarget = useFileInfoTarget((s) => s.set);
  const setFavorite = useSetModelFavorite();
  return {
    reveal: (m: LocalModel) =>
      void api.revealModel(m.id).catch((e: Error) => toast(e.message, "error")),
    fileInfo: (m: LocalModel) => {
      setTarget({ type: "model", id: m.id, name: m.name });
      go("file-info");
    },
    civitai: (m: LocalModel) => {
      if (!m.civitai) return;
      openCivitaiModel(m.civitai.modelId, m.name);
      go("models");
    },
    favorite: (m: LocalModel, favorite: boolean) =>
      setFavorite.mutate({ kind: m.kind, name: comfyNameOf(m), favorite }),
  };
}

/**
 * The right-click menu of a local model. `first` goes on top (the picker's "Use"), `file`
 * before Show in Explorer (Models → Local's Rename and Move).
 */
export function useModelMenu() {
  const actions = useModelActions();
  const favorites = useModelMarks().data?.favorites;
  return (m: LocalModel, extra: { first?: MenuEntry[]; file?: MenuEntry[] } = {}): MenuEntry[] => {
    const favorite = favorites?.includes(modelKey(m.kind, comfyNameOf(m))) ?? false;
    return [
      ...(extra.first ?? []),
      { id: "info", label: "Model info…", icon: "info", onSelect: () => openModelInfo(m.id) },
      {
        id: "favorite",
        label: favorite ? "Remove from favorites" : "Add to favorites",
        icon: "heart",
        onSelect: () => actions.favorite(m, !favorite),
      },
      { type: "separator", id: "s1" },
      ...(extra.file ?? []),
      {
        id: "reveal",
        label: "Show in Explorer",
        icon: "folder-open",
        onSelect: () => actions.reveal(m),
      },
      {
        id: "file-info",
        label: "File info",
        icon: "file-info",
        onSelect: () => actions.fileInfo(m),
      },
      ...(m.civitai
        ? [
            {
              id: "civitai",
              label: "Open on Civitai",
              icon: "globe",
              onSelect: () => actions.civitai(m),
            } satisfies MenuEntry,
          ]
        : []),
      { type: "separator", id: "s2" },
      {
        id: "copy",
        label: "Copy name",
        icon: "copy",
        onSelect: () =>
          void navigator.clipboard
            ?.writeText(comfyNameOf(m))
            .then(() => toast(`Copied "${comfyNameOf(m)}"`, "success")),
      },
    ];
  };
}
