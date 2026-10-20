/**
 * Which scope model cards show, and the picture a model has in it (shared/scopes.ts).
 *
 * The effective scope is the picked one, or with "auto" on, the scope whose tags best match the
 * Generate prompt. One follower (`<ScopeFollower />`, mounted in Shell) works it out, debounced, so
 * cards re-render only when the scope changes, never per keystroke. A model without a picture in
 * that scope keeps its own preview (the server already falls back to the default scope).
 */
import { useLocalModels, useScopes } from "@client/lib/queries";
import type { ModelKind } from "@shared/constants";
import type { LocalModel, ModelList } from "@shared/models";
import { DEFAULT_SCOPE, pickScope, scopeKey } from "@shared/scopes";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useValues } from "../generate/state";
import { useRoleBinding } from "../generate/workflow";

interface EffectiveScope {
  id: string;
  /** Prompt tags that picked it (auto), for the "Anime · from 1girl, anime" hint. */
  matched: string[];
  set: (id: string, matched: string[]) => void;
}

export const useEffectiveScope = create<EffectiveScope>((set, get) => ({
  id: DEFAULT_SCOPE,
  matched: [],
  set: (id, matched) => {
    const cur = get();
    if (cur.id !== id || cur.matched.join() !== matched.join()) set({ id, matched });
  },
}));

/**
 * Keeps the effective scope current. Mount once, as its own component (it follows the prompt,
 * so whatever calls it re-renders on every keystroke).
 */
export function ScopeFollower(): null {
  useFollowScope();
  return null;
}

function useFollowScope(): void {
  const scopes = useScopes().data;
  const positive = useRoleBinding("prompt.positive");
  const prompt = useValues((s) => (positive ? s.values[positive.id] : undefined));
  const set = useEffectiveScope((s) => s.set);
  useEffect(() => {
    if (!scopes) return;
    const text = typeof prompt === "string" ? prompt : "";
    const t = setTimeout(
      () => {
        const picked = scopes.auto ? pickScope(text, scopes.scopes) : null;
        set(picked?.id ?? scopes.active, picked?.matched ?? []);
      },
      scopes.auto ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [scopes, prompt, set]);
}

/** A model's picture in the effective scope (null: none there, or the default scope). */
export function useScopeThumb(): (kind: ModelKind, comfyName: string) => string | null {
  const id = useEffectiveScope((s) => s.id);
  const thumbs = useScopes().data?.thumbs;
  return useMemo(() => {
    const map = id === DEFAULT_SCOPE ? undefined : thumbs?.[id];
    return (kind, comfyName) => map?.[scopeKey(kind, comfyName)] ?? null;
  }, [id, thumbs]);
}

const stem = (name: string) =>
  name
    .replace(/\\/g, "/")
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "")
    .toLowerCase();

/** Local models by "<kind>:<ComfyUI name without extension>", for LoRA tags and pickers. */
function byStem(list: ModelList): Map<string, LocalModel> {
  const map = new Map<string, LocalModel>();
  for (const m of list.models) {
    const name = m.folder ? `${m.folder}/${m.file}` : m.file;
    map.set(`${m.kind}:${stem(name)}`, m);
    // LoRA tags are often written without the folder.
    if (!map.has(`${m.kind}:${stem(m.file)}`)) map.set(`${m.kind}:${stem(m.file)}`, m);
  }
  return map;
}

/**
 * The picture a model tile shows: the effective scope's, else its own preview. `name` may be a
 * ComfyUI name or a LoRA tag name (no extension).
 */
export function useModelThumb(
  kind: ModelKind,
  name: string,
): { thumb: string | null; nsfw: boolean } {
  const local = useLocalModels().data;
  const map = useMemo(() => (local ? byStem(local) : null), [local]);
  const scoped = useScopeThumb();
  const m = name ? map?.get(`${kind}:${stem(name)}`) : undefined;
  const comfyName = m ? (m.folder ? `${m.folder}/${m.file}` : m.file) : name;
  const fromScope = name ? scoped(kind, comfyName) : null;
  return { thumb: fromScope ?? m?.thumb ?? null, nsfw: fromScope ? false : Boolean(m?.nsfw) };
}
