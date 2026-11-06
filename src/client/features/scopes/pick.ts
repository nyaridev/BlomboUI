/**
 * Which scopes model cards show right now (ADR-0019): the picked ones, or with Auto on, the ones
 * the Generate prompt's tags pick. One follower (`<ScopeFollower />`, mounted in Shell) works it
 * out, debounced while Auto follows the prompt, so cards re-render only when the pick changes.
 * Scopes off: nothing is picked and every card shows its global picture.
 */
import { useScopes } from "@client/lib/queries";
import type { LocalModel } from "@shared/models";
import { effectivePick, GLOBAL_KEY, pickPicture } from "@shared/scopes";
import { useEffect } from "react";
import { create } from "zustand";
import { useValues } from "../generate/state";
import { useRoleBinding } from "../generate/workflow";

export interface ScopePick {
  ids: string[];
  optional: string[];
}

const NONE: ScopePick = { ids: [], optional: [] };

export const useScopePick = create<{ pick: ScopePick; set: (pick: ScopePick) => void }>(
  (set, get) => ({
    pick: NONE,
    set: (pick) => {
      const cur = get().pick;
      if (cur.ids.join() !== pick.ids.join() || cur.optional.join() !== pick.optional.join())
        set({ pick: pick.ids.length ? pick : NONE });
    },
  }),
);

/** Keeps the pick current. Mount once, on its own: it follows the prompt as you type. */
export function ScopeFollower(): null {
  const file = useScopes().data;
  const positive = useRoleBinding("prompt.positive");
  const auto = Boolean(file?.enabled && file.view.auto);
  // Only Auto needs the prompt; otherwise typing doesn't re-render this.
  const prompt = useValues((s) => (auto && positive ? s.values[positive.id] : undefined));
  const set = useScopePick((s) => s.set);
  useEffect(() => {
    if (!file) return set(NONE);
    const text = typeof prompt === "string" ? prompt : "";
    const t = setTimeout(() => set(effectivePick(file, text)), auto ? 300 : 0);
    return () => clearTimeout(t);
  }, [file, prompt, auto, set]);
  return null;
}

export interface ShownPicture {
  /** "global", or the scope ids of the picture shown. */
  key: string;
  thumb: string | null;
  raw: string | null;
}

/** The picture a model shows for a pick: the best scope picture, else its global one. */
export function shownPicture(model: LocalModel, pick: ScopePick): ShownPicture {
  const scoped = pickPicture(model.pictures, pick.ids, pick.optional);
  return scoped
    ? { key: scoped.key, thumb: scoped.thumb, raw: scoped.raw }
    : { key: GLOBAL_KEY, thumb: model.thumb, raw: model.rawThumb };
}

/** A model card's picture under the current pick. */
export function useModelPicture(model: LocalModel | undefined): string | null {
  const pick = useScopePick((s) => s.pick);
  return model ? shownPicture(model, pick).thumb : null;
}
