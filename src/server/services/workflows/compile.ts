/**
 * The compiler: a workflow package + values + a seed → the API graph sent to ComfyUI.
 *
 *   prompt.json → values onto bindings → wildcards and {a|b} choices (seeded) →
 *   <lora:…> tags out of the text and into the LoRA stack → seed → filename prefix
 *
 * It's pure: wildcard files and the LoRA file list are passed in, so it's fully testable.
 * Errors are CompileError with a message the user can act on.
 */
import { findLoraTags, formatLoraTag, stripLoraTags } from "../../../shared/prompt/loras.ts";
import { expandPrompt, type WildcardResolver } from "../../../shared/prompt/wildcards.ts";
import { rng } from "../../../shared/random.ts";
import type { ApiPrompt } from "../../../shared/workflow/graph.ts";
import type { Binding, WorkflowManifest } from "../../../shared/workflow/manifest.ts";
import { findLoraSources, findLoraStack } from "./analyze.ts";
import { LORA_LOADER, LORA_LOADER_MODEL_ONLY } from "./nodes.ts";

export class CompileError extends Error {}

export interface CompileInput {
  manifest: Pick<WorkflowManifest, "bindings">;
  prompt: ApiPrompt;
  values: Record<string, unknown>;
  seed: number;
  wildcards: WildcardResolver;
  /** LoRA files ComfyUI knows (LoraLoader's lora_name choices); null when unknown. */
  loraFiles: string[] | null;
  /** Used when the graph's own prefix is ComfyUI's default. */
  filenamePrefix: string;
}

export interface ResolvedLora {
  file: string;
  strength: number;
  clipStrength: number;
}

export interface CompileResult {
  prompt: ApiPrompt;
  /** Final texts after wildcards, with LoRA tags removed. */
  texts: Record<string, string>;
  loras: ResolvedLora[];
}

function coerce(b: Binding, value: unknown): unknown {
  switch (b.type) {
    case "int":
    case "seed": {
      const n = Math.round(Number(value));
      return Number.isFinite(n) ? n : undefined;
    }
    case "float": {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case "bool":
      return value === true || value === "true";
    case "loras":
      return undefined;
    default:
      return value === null || value === undefined ? undefined : String(value);
  }
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

export function compile(input: CompileInput): CompileResult {
  const prompt = structuredClone(input.prompt);
  const set = (b: Binding, v: unknown) => {
    const node = prompt[b.node];
    if (!node)
      throw new CompileError(`The workflow lost node ${b.node} ("${b.label}"). Re-import it.`);
    node.inputs[b.input] = v;
  };

  // 1. Values onto bindings.
  for (const b of input.manifest.bindings) {
    if (!(b.id in input.values)) continue;
    const v = coerce(b, input.values[b.id]);
    if (v !== undefined) set(b, v);
  }

  // 2. Wildcards and choices, seeded by the image seed so a seed reproduces its prompt.
  const random = rng(input.seed);
  const texts: Record<string, string> = {};
  const tags: ReturnType<typeof findLoraTags> = [];
  for (const b of input.manifest.bindings) {
    if (b.type !== "prompt") continue;
    const raw = prompt[b.node]?.inputs[b.input];
    if (typeof raw !== "string") continue;
    const expanded = expandPrompt(raw, random, input.wildcards);
    if (expanded.missing.length)
      throw new CompileError(
        `No wildcard file for ${expanded.missing.map((m) => `__${m}__`).join(", ")}. Add ${expanded.missing[0]}.txt to the profile's wildcards folder, or fix the name.`,
      );
    // 3. LoRA tags leave the text and go into the graph.
    tags.push(...findLoraTags(expanded.text));
    const clean = stripLoraTags(expanded.text);
    texts[b.id] = clean;
    set(b, clean);
  }

  const loras: ResolvedLora[] = [];
  for (const tag of tags) {
    const file = resolveLoraFile(tag.name, input.loraFiles);
    if (!file)
      throw new CompileError(
        `LoRA "${tag.name}" isn't in your loras folder. Check the name in ${formatLoraTag(tag.name, tag.strength)}.`,
      );
    if (loras.some((l) => l.file === file)) continue;
    loras.push({ file, strength: tag.strength, clipStrength: tag.clipStrength ?? tag.strength });
  }
  if (loras.length) applyLoras(prompt, loras);

  // 4. Seed (each run has its own; the value in the workflow is only the starting point).
  const seedBinding = input.manifest.bindings.find((b) => b.role === "sampler.seed");
  if (seedBinding) set(seedBinding, input.seed);

  // 5. Filename prefix, unless the user set one in the graph.
  const out = input.manifest.bindings.find((b) => b.role === "output.image");
  if (out) {
    const current = prompt[out.node]?.inputs[out.input];
    if (current === undefined || current === "" || current === "ComfyUI")
      set(out, input.filenamePrefix);
  }

  return { prompt, texts, loras };
}

function nextId(prompt: ApiPrompt): () => string {
  let n = Math.max(
    0,
    ...Object.keys(prompt)
      .map((k) => Number(k))
      .filter(Number.isFinite),
  );
  return () => String(++n);
}

function applyLoras(prompt: ApiPrompt, loras: ResolvedLora[]): void {
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
  const id = nextId(prompt);
  const [mNode, mSlot] = sources.model;
  const clip = sources.clip;
  const consumers = Object.values(prompt).flatMap((node) =>
    Object.entries(node.inputs).map(([name, v]) => ({ node, name, v })),
  );
  let model: [string, number] = [mNode, mSlot];
  let clipOut: [string, number] | null = clip ? [clip[0], clip[1]] : null;
  for (const l of loras) {
    const nid = id();
    prompt[nid] = clipOut
      ? {
          class_type: LORA_LOADER,
          inputs: {
            lora_name: l.file,
            strength_model: l.strength,
            strength_clip: l.clipStrength,
            model,
            clip: clipOut,
          },
          _meta: { title: `LoRA ${l.file}` },
        }
      : {
          class_type: LORA_LOADER_MODEL_ONLY,
          inputs: { lora_name: l.file, strength_model: l.strength, model },
          _meta: { title: `LoRA ${l.file}` },
        };
    model = [nid, 0];
    if (clipOut) clipOut = [nid, 1];
  }
  for (const { node, name, v } of consumers) {
    if (!Array.isArray(v)) continue;
    if (String(v[0]) === mNode && v[1] === mSlot) node.inputs[name] = model;
    else if (clip && clipOut && String(v[0]) === clip[0] && v[1] === clip[1])
      node.inputs[name] = clipOut;
  }
}
