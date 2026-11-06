/**
 * What an image says about how it was made. Three sources, best first:
 *
 *   blombo   our own chunk: workflow id and name, seed, values, final prompt texts
 *   comfy    ComfyUI's "prompt" chunk (API graph); the server reads roles out of it
 *   a1111    the "parameters" text that A1111, Forge and many tools write
 *   civitai  what a poster shared on Civitai, saved next to an image added from there
 *
 * The parsers here are pure so the server (gallery index, File Info) and tests share them.
 */
import { z } from "zod";
import { parseAir } from "./civitai.ts";
import { findLoraTags } from "./prompt/loras.ts";

export const IMAGE_SOURCES = ["blombo", "comfy", "a1111", "civitai", "none"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export const LoraUse = z.object({ name: z.string(), strength: z.number().nullable() });
export type LoraUse = z.infer<typeof LoraUse>;

/** A model on Civitai: the model and the version. */
export const CivitaiRef = z.object({ modelId: z.number().int(), versionId: z.number().int() });
export type CivitaiRef = z.infer<typeof CivitaiRef>;

/**
 * What Blombo writes into every image it makes, beside ComfyUI's `prompt` (API graph) and
 * `workflow` (canvas) chunks: ComfyUI's `extra_pnginfo.blombo`, a PNG text chunk "blombo".
 */
export const BlomboImageMeta = z.object({
  /** The Blombo workflow's id and name. */
  workflow: z.string().nullable(),
  name: z.string().nullable(),
  seed: z.number().nullable(),
  /** The Generate screen's values by binding id, as set (prompts still hold their <lora:> tags). */
  values: z.record(z.string(), z.unknown()),
  /** The prompts as they ran by role: wildcards filled in, trigger words added, LoRA tags out. */
  prompts: z.record(z.string(), z.string()),
});
export type BlomboImageMeta = z.infer<typeof BlomboImageMeta>;

/** The settings worth showing (and searching) for one image. */
export const ImageSummary = z.object({
  source: z.enum(IMAGE_SOURCES),
  prompt: z.string().nullable(),
  negative: z.string().nullable(),
  model: z.string().nullable(),
  loras: z.array(LoraUse),
  seed: z.number().nullable(),
  steps: z.number().nullable(),
  cfg: z.number().nullable(),
  sampler: z.string().nullable(),
  scheduler: z.string().nullable(),
  /** Generation size (may differ from the file after upscaling). */
  width: z.number().nullable(),
  height: z.number().nullable(),
  workflow: z.string().nullable(),
  workflowId: z.string().nullable(),
  /** The Civitai model behind a model or LoRA name, by that name (models named by AIR). */
  civitai: z.record(z.string(), CivitaiRef).default({}),
});
export type ImageSummary = z.infer<typeof ImageSummary>;

export const EMPTY_SUMMARY: ImageSummary = {
  source: "none",
  prompt: null,
  negative: null,
  model: null,
  loras: [],
  seed: null,
  steps: null,
  cfg: null,
  sampler: null,
  scheduler: null,
  width: null,
  height: null,
  workflow: null,
  workflowId: null,
  civitai: {},
};

/**
 * Generation settings keyed by role ("prompt.positive", "sampler.steps"…), so they can be put
 * into any workflow that has those roles. Values are what the graph or text held.
 */
export const RoleValues = z.record(z.string(), z.unknown());
export type RoleValues = z.infer<typeof RoleValues>;

/** Everything "Use these settings" needs. */
export const ImageSettings = z.object({
  /** The Blombo workflow that made the image, when it still exists in this profile. */
  workflowId: z.string().nullable(),
  /** Its saved values by binding id (only from the blombo chunk). */
  values: z.record(z.string(), z.unknown()).nullable(),
  roles: RoleValues,
});
export type ImageSettings = z.infer<typeof ImageSettings>;

/* ── A1111 "parameters" ─────────────────────────────────────────────────── */

export interface A1111Parameters {
  positive: string;
  negative: string;
  /** "Steps: 28, Sampler: Euler a, …" as ordered pairs. */
  settings: Array<[string, string]>;
}

/** Split the settings line on commas that aren't inside quotes ("Lora hashes: "a: 1, b: 2""). */
function splitSettings(line: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /\s*([^:,]+):\s*("(?:\\.|[^"\\])*"|[^,]*)(?:,|$)/g;
  for (const m of line.matchAll(re)) {
    const key = (m[1] ?? "").trim();
    let value = (m[2] ?? "").trim();
    if (!key) continue;
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        value = value.slice(1, -1);
      }
    }
    out.push([key, value]);
  }
  return out;
}

export function parseA1111(text: string): A1111Parameters | null {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  const lines = normalized.split("\n");
  // The settings line is the last line that starts with "Steps:".
  let settingsAt = -1;
  for (let i = lines.length - 1; i >= 0; i--)
    if (/^\s*Steps:\s*\d/.test(lines[i] ?? "")) {
      settingsAt = i;
      break;
    }
  const body = settingsAt >= 0 ? lines.slice(0, settingsAt) : lines;
  const settingsLine = settingsAt >= 0 ? lines.slice(settingsAt).join(", ") : "";
  const negAt = body.findIndex((l) => l.startsWith("Negative prompt:"));
  const positive = (negAt >= 0 ? body.slice(0, negAt) : body).join("\n").trim();
  const negative =
    negAt >= 0
      ? body
          .slice(negAt)
          .join("\n")
          .replace(/^Negative prompt:\s*/, "")
          .trim()
      : "";
  return { positive, negative, settings: splitSettings(settingsLine) };
}

function numberOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Summary and role values from A1111 parameters. */
export function a1111Summary(p: A1111Parameters): { summary: ImageSummary; roles: RoleValues } {
  const get = (key: string) => p.settings.find(([k]) => k.toLowerCase() === key)?.[1];
  const size = get("size")?.match(/^(\d+)\s*x\s*(\d+)$/i);
  const loras = findLoraTags(p.positive).map((t) => ({ name: t.name, strength: t.strength }));
  const summary: ImageSummary = {
    ...EMPTY_SUMMARY,
    source: "a1111",
    prompt: p.positive || null,
    negative: p.negative || null,
    model: get("model") ?? null,
    loras,
    seed: numberOrNull(get("seed")),
    steps: numberOrNull(get("steps")),
    cfg: numberOrNull(get("cfg scale")),
    sampler: get("sampler") ?? null,
    scheduler: get("schedule type") ?? null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
  };
  const roles: RoleValues = {};
  if (summary.prompt !== null) roles["prompt.positive"] = summary.prompt;
  if (summary.negative !== null) roles["prompt.negative"] = summary.negative;
  if (summary.seed !== null) roles["sampler.seed"] = summary.seed;
  if (summary.steps !== null) roles["sampler.steps"] = summary.steps;
  if (summary.cfg !== null) roles["sampler.cfg"] = summary.cfg;
  if (summary.width !== null) roles["latent.width"] = summary.width;
  if (summary.height !== null) roles["latent.height"] = summary.height;
  const sampler = summary.sampler ? a1111SamplerToComfy(summary.sampler) : null;
  if (sampler) {
    roles["sampler.name"] = sampler.sampler;
    // Newer A1111 and Forge write the scheduler on its own ("Schedule type: Karras").
    const scheduler =
      sampler.scheduler ?? (summary.scheduler ? a1111ScheduleToComfy(summary.scheduler) : null);
    if (scheduler) roles["sampler.scheduler"] = scheduler;
  }
  const clipSkip = numberOrNull(get("clip skip"));
  if (clipSkip !== null) roles["clip.skip"] = -Math.abs(clipSkip);
  return { summary, roles };
}

/** Whether a summary names a model or LoRA by Civitai AIR (`parseAir`). */
export function hasAirs(s: ImageSummary): boolean {
  return [s.model, ...s.loras.map((l) => l.name)].some((n) => n !== null && parseAir(n));
}

/**
 * The summary with each model or LoRA named by AIR given its name by version id (`nameOf`), or
 * "Civitai model <id>" when nothing knows it. `civitai` keeps the ids behind each new name.
 */
export function nameAirs(
  s: ImageSummary,
  nameOf: (versionId: number) => string | null | undefined,
): ImageSummary {
  const civitai = { ...s.civitai };
  const name = (n: string) => {
    const air = parseAir(n);
    if (!air) return n;
    const named = nameOf(air.versionId) || `Civitai model ${air.modelId}`;
    civitai[named] = air;
    return named;
  };
  return {
    ...s,
    model: s.model === null ? null : name(s.model),
    loras: s.loras.map((l) => ({ ...l, name: name(l.name) })),
    civitai,
  };
}

/** Civitai's keys for how an image was made, as A1111 names them. */
const CIVITAI_KEYS: Array<[string, string[]]> = [
  ["Steps", ["steps", "Steps"]],
  ["Sampler", ["sampler", "Sampler"]],
  ["Schedule type", ["scheduler", "Schedule type"]],
  ["CFG scale", ["cfgScale", "CFG scale"]],
  ["Seed", ["seed", "Seed"]],
  ["Size", ["Size", "size"]],
  ["Model", ["Model", "model"]],
  ["Clip skip", ["clipSkip", "Clip skip"]],
  ["Denoising strength", ["denoise", "Denoising strength"]],
];

/**
 * The summary of what a poster shared on Civitai (its `meta`, Civitai's own keys). LoRAs come
 * from the prompt's tags or, without any, Civitai's list of resources.
 */
export function civitaiSummary(meta: Record<string, unknown>): {
  summary: ImageSummary;
  roles: RoleValues;
} {
  const text = (v: unknown) =>
    typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  const settings = CIVITAI_KEYS.flatMap(([label, keys]): Array<[string, string]> => {
    const v = keys.map((k) => text(meta[k])).find(Boolean);
    return v ? [[label, v]] : [];
  });
  const { summary, roles } = a1111Summary({
    positive: text(meta.prompt),
    negative: text(meta.negativePrompt),
    settings,
  });
  if (!summary.loras.length && Array.isArray(meta.resources))
    for (const r of meta.resources as Array<Record<string, unknown>>)
      if (r && String(r.type).toLowerCase() === "lora" && text(r.name))
        summary.loras.push({
          name: text(r.name),
          strength: typeof r.weight === "number" ? r.weight : null,
        });
  return { summary: { ...summary, source: "civitai" }, roles };
}

/** A1111 / Forge "Schedule type" names to ComfyUI schedulers ("Automatic" picks none). */
export function a1111ScheduleToComfy(name: string): string | null {
  const map: Record<string, string> = {
    karras: "karras",
    exponential: "exponential",
    "sgm uniform": "sgm_uniform",
    simple: "simple",
    normal: "normal",
    uniform: "normal",
    ddim: "ddim_uniform",
    beta: "beta",
    "kl optimal": "kl_optimal",
  };
  return map[name.trim().toLowerCase()] ?? null;
}

/** A1111 sampler names ("DPM++ 2M Karras") to ComfyUI sampler and scheduler names. */
export function a1111SamplerToComfy(name: string): { sampler: string; scheduler: string | null } {
  let rest = name.trim();
  let scheduler: string | null = null;
  for (const [suffix, sched] of [
    [" Karras", "karras"],
    [" Exponential", "exponential"],
    [" SGM Uniform", "sgm_uniform"],
  ] as const) {
    if (rest.endsWith(suffix)) {
      rest = rest.slice(0, -suffix.length);
      scheduler = sched;
    }
  }
  const map: Record<string, string> = {
    "euler a": "euler_ancestral",
    euler: "euler",
    lms: "lms",
    heun: "heun",
    dpm2: "dpm_2",
    "dpm2 a": "dpm_2_ancestral",
    "dpm++ 2s a": "dpmpp_2s_ancestral",
    "dpm++ 2m": "dpmpp_2m",
    "dpm++ sde": "dpmpp_sde",
    "dpm++ 2m sde": "dpmpp_2m_sde",
    "dpm++ 3m sde": "dpmpp_3m_sde",
    "dpm fast": "dpm_fast",
    "dpm adaptive": "dpm_adaptive",
    ddim: "ddim",
    "uni pc": "uni_pc",
    unipc: "uni_pc",
    lcm: "lcm",
  };
  const sampler = map[rest.toLowerCase()];
  return { sampler: sampler ?? rest, scheduler };
}

/** Joined text the gallery search runs over. */
/** A model an image was made with (File Info looks each one up locally and on Civitai). */
export interface UsedModel {
  kind: "checkpoint" | "lora";
  name: string;
  strength: number | null;
  /** The hash A1111 wrote for it ("Model hash", "Lora hashes"), uppercase; null without one. */
  hash: string | null;
}

/** A model's name compared loosely: the file name without folders or extension, lowercase. */
export function modelKey(name: string): string {
  const file = name.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  return file.replace(/\.(safetensors|sft|ckpt|pt|pth|bin)$/i, "").toLowerCase();
}

/** The checkpoint and LoRAs an image used, with the hashes A1111 parameters carry. */
export function usedModels(s: ImageSummary, a1111: Array<[string, string]> = []): UsedModel[] {
  const get = (key: string) => a1111.find(([k]) => k.toLowerCase() === key)?.[1];
  const hex = (v: string | undefined) => {
    const h = v?.trim() ?? "";
    return /^[0-9a-f]{8,64}$/i.test(h) ? h.toUpperCase() : null;
  };
  // "Lora hashes": "name: hash, other: hash"
  const loraHashes = new Map<string, string>();
  for (const part of (get("lora hashes") ?? "").split(",")) {
    const at = part.lastIndexOf(":");
    const h = at > 0 ? hex(part.slice(at + 1)) : null;
    if (h) loraHashes.set(modelKey(part.slice(0, at)), h);
  }
  const out: UsedModel[] = [];
  if (s.model)
    out.push({ kind: "checkpoint", name: s.model, strength: null, hash: hex(get("model hash")) });
  for (const l of s.loras)
    out.push({
      kind: "lora",
      name: l.name,
      strength: l.strength,
      hash: loraHashes.get(modelKey(l.name)) ?? null,
    });
  return out;
}

export function searchText(name: string, s: ImageSummary): string {
  return [
    name,
    s.prompt,
    s.negative,
    s.model,
    s.workflow,
    s.sampler,
    ...s.loras.map((l) => l.name),
    s.seed !== null ? String(s.seed) : null,
  ]
    .filter(Boolean)
    .join("\n");
}
