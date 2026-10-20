/**
 * <lora:…> tags → graph nodes. The base prompt's tags go into the workflow's LoRA stack (or a
 * chain of loaders right after its model and CLIP loaders); a stage prompt's tags become a
 * chain that only that stage uses. Pure, like the compiler.
 */
import { findLoraTags, formatLoraTag, type LoraTag } from "../../../shared/prompt/loras.ts";
import type { ApiLink, ApiPrompt } from "../../../shared/workflow/graph.ts";
import { findLoraSources, findLoraStack } from "./analyze.ts";
import { LORA_LOADER, LORA_LOADER_MODEL_ONLY } from "./nodes.ts";

export class CompileError extends Error {}

export interface ResolvedLora {
  file: string;
  strength: number;
  clipStrength: number;
}

const stem = (f: string) =>
  f
    .replace(/\\/g, "/")
    .replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "")
    .toLowerCase();

/** Match a tag name ("detail", "SDXL/detail", "detail.safetensors") to a LoRA file. */
export function resolveLoraFile(name: string, files: string[] | null): string | null {
  if (!files) return /\.\w+$/.test(name) ? name : `${name}.safetensors`;
  const want = stem(name);
  return (
    files.find((f) => stem(f) === want) ??
    files.find((f) => stem(f).split("/").pop() === want.split("/").pop()) ??
    null
  );
}

/** Tags → files, first use of a file wins. Unknown names stop the run with the tag to fix. */
export function resolveLoras(tags: LoraTag[], files: string[] | null): ResolvedLora[] {
  const out: ResolvedLora[] = [];
  for (const tag of tags) {
    const file = resolveLoraFile(tag.name, files);
    if (!file)
      throw new CompileError(
        `LoRA "${tag.name}" isn't in your loras folder. Check the name in ${formatLoraTag(tag.name, tag.strength)}.`,
      );
    if (out.some((l) => l.file === file)) continue;
    out.push({ file, strength: tag.strength, clipStrength: tag.clipStrength ?? tag.strength });
  }
  return out;
}

export function lorasIn(text: string, files: string[] | null): ResolvedLora[] {
  return resolveLoras(findLoraTags(text), files);
}

/** A generator of free node ids after the highest numeric one. */
export function idGenerator(prompt: ApiPrompt): () => string {
  let n = Math.max(
    0,
    ...Object.keys(prompt)
      .map((k) => Number(k))
      .filter(Number.isFinite),
  );
  return () => {
    while (String(n + 1) in prompt) n++;
    return String(++n);
  };
}

/** Loader nodes from `model` (and `clip`); returns the links at the end of the chain. */
export function chainLoras(
  prompt: ApiPrompt,
  model: ApiLink,
  clip: ApiLink | null,
  loras: ResolvedLora[],
  nextId: () => string,
  titlePrefix = "LoRA",
): { model: ApiLink; clip: ApiLink | null } {
  let m: ApiLink = model;
  let c: ApiLink | null = clip;
  for (const l of loras) {
    const nid = nextId();
    prompt[nid] = c
      ? {
          class_type: LORA_LOADER,
          inputs: {
            lora_name: l.file,
            strength_model: l.strength,
            strength_clip: l.clipStrength,
            model: m,
            clip: c,
          },
          _meta: { title: `${titlePrefix} ${l.file}` },
        }
      : {
          class_type: LORA_LOADER_MODEL_ONLY,
          inputs: { lora_name: l.file, strength_model: l.strength, model: m },
          _meta: { title: `${titlePrefix} ${l.file}` },
        };
    m = [nid, 0];
    if (c) c = [nid, 1];
  }
  return { model: m, clip: c };
}

/** The base prompt's LoRAs: into the graph's stack, or chained after its loaders. */
export function applyLoras(prompt: ApiPrompt, loras: ResolvedLora[]): void {
  // A stack node (rgthree Power Lora Loader) takes them as lora_<n> entries.
  const stack = findLoraStack(prompt);
  const stackNode = stack ? prompt[stack] : undefined;
  if (stackNode) {
    const taken = Object.keys(stackNode.inputs)
      .map((k) => /^lora_(\d+)$/.exec(k)?.[1])
      .filter(Boolean)
      .map(Number);
    let n = Math.max(0, ...taken);
    for (const l of loras)
      stackNode.inputs[`lora_${++n}`] = {
        on: true,
        lora: l.file,
        strength: l.strength,
        strengthTwo: l.clipStrength === l.strength ? null : l.clipStrength,
      };
    return;
  }

  // Otherwise chain loaders right after the model (and CLIP) loader and rewire consumers.
  const sources = findLoraSources(prompt);
  if (!sources)
    throw new CompileError(
      "This workflow has no model loader to attach LoRAs to. Remove the <lora:…> tags.",
    );
  const consumers = Object.values(prompt).flatMap((node) =>
    Object.entries(node.inputs).map(([name, v]) => ({ node, name, v })),
  );
  const { model: mOld, clip: cOld } = sources;
  const out = chainLoras(prompt, mOld, cOld, loras, idGenerator(prompt));
  for (const { node, name, v } of consumers) {
    if (!Array.isArray(v)) continue;
    if (String(v[0]) === mOld[0] && v[1] === mOld[1]) node.inputs[name] = out.model;
    else if (cOld && out.clip && String(v[0]) === cOld[0] && v[1] === cOld[1])
      node.inputs[name] = out.clip;
  }
}
