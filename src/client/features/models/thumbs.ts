/**
 * A model's local info (its picture: `<model>_data/thumbs/`, the one the scopes picked, or what a Civitai lookup found; a
 * LoRA's strength range…), looked up by kind and ComfyUI name or LoRA tag name, from Models →
 * Local's list.
 */
import { useLocalModels } from "@client/lib/queries";
import type { ModelKind } from "@shared/constants";
import {
  comfyNameOf,
  DEFAULT_STRENGTH_RANGE,
  type LocalModel,
  type ModelList,
} from "@shared/models";
import { useMemo } from "react";
import { useModelPicture } from "../scopes/pick";

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

/** The local model a ComfyUI name or a LoRA tag name (no extension) is, when it's local. */
export function useLocalModel(kind: ModelKind, name: string): LocalModel | undefined {
  const local = useLocalModels().data;
  const map = useMemo(() => (local ? byStem(local) : null), [local]);
  return name ? map?.get(`${kind}:${stem(name)}`) : undefined;
}

/** A model tile's picture (the scopes' pick when they're on). */
export function useModelThumb(kind: ModelKind, name: string): string | null {
  return useModelPicture(useLocalModel(kind, name));
}

/** A LoRA's strength slider range (0–2 unless its model info says otherwise). */
export function useStrengthRange(name: string): [number, number] {
  return useLocalModel("loras", name)?.strengthRange ?? DEFAULT_STRENGTH_RANGE;
}
