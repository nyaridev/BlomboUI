/**
 * What an image says about how it was made. Three sources, best first:
 *
 *   blombo   our own chunk: workflow id and name, seed, values, final prompt texts
 *   comfy    ComfyUI's "prompt" chunk (API graph); the server reads roles out of it
 *   a1111    the "parameters" text that A1111, Forge and many tools write
 *
 * The parsers here are pure so the server (gallery index, File Info) and tests share them.
 */
import { z } from "zod";
import { findLoraTags } from "./prompt/loras.ts";

export const IMAGE_SOURCES = ["blombo", "comfy", "a1111", "none"] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export const LoraUse = z.object({ name: z.string(), strength: z.number().nullable() });
export type LoraUse = z.infer<typeof LoraUse>;

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
