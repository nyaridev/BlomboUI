/**
 * The compiler: a workflow package + values + a seed → the API graph sent to ComfyUI.
 *
 *   prompt.json → values onto bindings → wildcards and {a|b} choices (seeded) →
 *   <lora:…> tags out of the text and into the LoRA stack → enabled stages spliced at role
 *   ports (controlnet → base → hires → adetailer units) → seed → filename prefix
 *
 * It's pure: wildcard files, the LoRA file list, stage packages and ComfyUI's node list are
 * passed in, so it's fully testable. Errors are CompileError with a message the user can act on.
 */
import { findLoraTags, stripLoraTags } from "../../../shared/prompt/loras.ts";
import { expandPrompt, type WildcardResolver } from "../../../shared/prompt/wildcards.ts";
import { rng } from "../../../shared/random.ts";
import type { ApiPrompt, ObjectInfo } from "../../../shared/workflow/graph.ts";
import type { Binding, WorkflowManifest } from "../../../shared/workflow/manifest.ts";
import type { RunSegment, StageSettings, StageStatus } from "../../../shared/workflow/stages.ts";
import { applyLoras, CompileError, type ResolvedLora, resolveLoras } from "./loras.ts";
import { applyStages, baseSegments, type LoadedStage } from "./stages.ts";

export { CompileError, type ResolvedLora, resolveLoraFile } from "./loras.ts";

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
  /** Stage settings; enabled stages are spliced in. */
  stages?: StageSettings;
  stagePackages?: LoadedStage[];
  /** Stage image file → its name in ComfyUI's input folder (uploaded before compiling). */
  stageImages?: Record<string, string>;
  /** ComfyUI's node definitions, to check stage nodes and models; null when unknown. */
  objectInfo?: ObjectInfo | null;
}

export interface CompileResult {
  prompt: ApiPrompt;
  /** Final texts after wildcards, with LoRA tags removed (stage prompts as "hires.prompt"). */
  texts: Record<string, string>;
  loras: ResolvedLora[];
  /** The run's parts for the progress bar: base passes, then each stage. */
  segments: RunSegment[];
  stages: StageStatus[];
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

  const loras = resolveLoras(tags, input.loraFiles);
  if (loras.length) applyLoras(prompt, loras);

  // 4. Stages, at the ports the graph has now (after its LoRAs).
  const segments = baseSegments(prompt);
  let stages: StageStatus[] = [];
  if (input.stages && input.stagePackages) {
    const result = applyStages(prompt, input.stages, input.stagePackages, {
      bindings: input.manifest.bindings,
      values: input.values,
      seed: input.seed,
      wildcards: input.wildcards,
      random,
      loraFiles: input.loraFiles,
      images: input.stageImages ?? {},
      filenamePrefix: input.filenamePrefix,
      info: input.objectInfo ?? null,
    });
    const problems = result.statuses.flatMap((s) => s.problems);
    if (problems.length) throw new CompileError(problems.map((p) => p.message).join(" "));
    segments.push(...result.segments);
    Object.assign(texts, result.texts);
    stages = result.statuses;
  }

  // 5. Seed (each run has its own; the value in the workflow is only the starting point).
  const seedBinding = input.manifest.bindings.find((b) => b.role === "sampler.seed");
  if (seedBinding) set(seedBinding, input.seed);

  // 6. Filename prefix, unless the user set one in the graph.
  const out = input.manifest.bindings.find((b) => b.role === "output.image");
  if (out) {
    const current = prompt[out.node]?.inputs[out.input];
    if (current === undefined || current === "" || current === "ComfyUI")
      set(out, input.filenamePrefix);
  }

  return { prompt, texts, loras, segments, stages };
}
