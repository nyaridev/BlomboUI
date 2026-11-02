/**
 * The picture a model has (its `<model>_data/thumb.*`, or what a Civitai lookup found), looked
 * up by kind and ComfyUI name or LoRA tag name, from Models → Local's list.
 */
import { useLocalModels } from "@client/lib/queries";
import type { ModelKind } from "@shared/constants";
import { comfyNameOf, type LocalModel, type ModelList } from "@shared/models";
import { useMemo } from "react";

const stem = (name: string) =>
  name
    .replace(/\\/g, "/")
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "")
    .toLowerCase();

/** Local models by "<kind>:<ComfyUI name without extension>", for LoRA tags and pickers. */
function byStem(list: ModelList): Map<string, LocalModel> {
  const map = new Map<string, LocalModel>();
  for (const m of list.models) {
    map.set(`${m.kind}:${stem(comfyNameOf(m))}`, m);
    // LoRA tags are often written without the folder.
    if (!map.has(`${m.kind}:${stem(m.file)}`)) map.set(`${m.kind}:${stem(m.file)}`, m);
  }
  return map;
}

/** A model tile's picture. `name` may be a ComfyUI name or a LoRA tag name (no extension). */
export function useModelThumb(
  kind: ModelKind,
  name: string,
): { thumb: string | null; nsfw: boolean } {
  const local = useLocalModels().data;
  const map = useMemo(() => (local ? byStem(local) : null), [local]);
  const m = name ? map?.get(`${kind}:${stem(name)}`) : undefined;
  return { thumb: m?.thumb ?? null, nsfw: Boolean(m?.nsfw) };
}
