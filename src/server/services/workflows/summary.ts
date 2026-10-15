/**
 * What a ComfyUI API graph (an image's "prompt" chunk) says about how the image was made:
 * prompt texts, model, LoRAs, seed, steps, CFG, sampler and size. The analyzer finds the roles;
 * LoRAs are read from every loader in the graph (they can sit anywhere on the model chain).
 * Used by the gallery index and File Info; never modifies the graph.
 */
import type { ImageSummary, LoraUse, RoleValues } from "../../../shared/imageinfo.ts";
import { type ApiPrompt, isApiLink } from "../../../shared/workflow/graph.ts";
import { analyze } from "./analyze.ts";
import { LORA_STACK_CLASSES } from "./nodes.ts";

const ROLE_KEYS = [
  "prompt.positive",
  "prompt.negative",
  "model.checkpoint",
  "model.unet",
  "sampler.seed",
  "sampler.steps",
  "sampler.cfg",
  "sampler.name",
  "sampler.scheduler",
  "sampler.denoise",
  "latent.width",
  "latent.height",
  "clip.skip",
  "model.vae",
  "model.clip",
  "model.clip2",
] as const;

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Model file name without folders or extension, the way people say it. */
export function modelLabel(file: string | null): string | null {
  if (!file) return null;
  return (
    file
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "") ?? file
  );
}

export function findLoras(prompt: ApiPrompt): LoraUse[] {
  const out: LoraUse[] = [];
  for (const node of Object.values(prompt)) {
    const inputs = node.inputs ?? {};
    if (LORA_STACK_CLASSES.has(node.class_type)) {
      for (const [k, v] of Object.entries(inputs)) {
        if (!/^lora_\d+$/i.test(k) || !v || typeof v !== "object" || isApiLink(v)) continue;
        const entry = v as { on?: unknown; lora?: unknown; strength?: unknown };
        if (entry.on === false || typeof entry.lora !== "string" || entry.lora === "None") continue;
        out.push({ name: modelLabel(entry.lora) ?? entry.lora, strength: num(entry.strength) });
      }
      continue;
    }
    const name = str(inputs.lora_name);
    if (!name || name === "None") continue;
    const strength = num(inputs.strength_model) ?? num(inputs.strength);
    if (strength === 0) continue;
    out.push({ name: modelLabel(name) ?? name, strength });
  }
  return out;
}

/** Summary fields and role values found in a graph. */
export function summarizeGraph(prompt: ApiPrompt): {
  summary: Omit<ImageSummary, "source" | "workflow" | "workflowId">;
  roles: RoleValues;
} {
  const { values } = analyze(prompt, null);
  const roles: RoleValues = {};
  for (const key of ROLE_KEYS) if (values[key] !== undefined) roles[key] = values[key];
  return {
    summary: {
      prompt: str(values["prompt.positive"]),
      negative: str(values["prompt.negative"]),
      model: modelLabel(str(values["model.checkpoint"]) ?? str(values["model.unet"])),
      loras: findLoras(prompt),
      seed: num(values["sampler.seed"]),
      steps: num(values["sampler.steps"]),
      cfg: num(values["sampler.cfg"]),
      sampler: str(values["sampler.name"]),
      scheduler: str(values["sampler.scheduler"]),
      width: num(values["latent.width"]),
      height: num(values["latent.height"]),
    },
    roles,
  };
}
