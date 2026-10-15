/**
 * ComfyUI engine state as the app sees it: the supervisor's status, GPU stats sampled for the
 * header, and log lines. All of these travel over the live bus (shared/live.ts) and /api/comfy.
 */
import { z } from "zod";

export const COMFY_STATES = [
  /** Managed slot not running (never started, or stopped on purpose). */
  "stopped",
  "starting",
  "running",
  "stopping",
  "restarting",
  /** Managed process exited without being asked to. */
  "crashed",
  /** Managed slot folder has no ComfyUI or no Python. */
  "missing",
  /** External ComfyUI didn't answer; the supervisor keeps trying. */
  "unreachable",
] as const;
export const ComfyState = z.enum(COMFY_STATES);
export type ComfyState = z.infer<typeof ComfyState>;

export const ComfyStatus = z.object({
  state: ComfyState,
  mode: z.enum(["managed", "external"]),
  /** Managed slot name; null for an external ComfyUI. */
  slot: z.string().nullable(),
  /** Base URL Blombo talks to, e.g. http://127.0.0.1:8188. */
  url: z.string(),
  pid: z.number().int().nullable(),
  startedAt: z.string().nullable(),
  /** ComfyUI version reported by /system_stats once connected. */
  version: z.string().nullable(),
  /** Plain-language reason for the current state, with what to do next. */
  message: z.string().nullable(),
  /** The profile's models or outputs folder changed since ComfyUI started. */
  restartNeeded: z.boolean(),
});
export type ComfyStatus = z.infer<typeof ComfyStatus>;

export const GpuStats = z.object({
  name: z.string(),
  /** GiB. */
  vramUsed: z.number(),
  vramTotal: z.number(),
  /** °C; null when the source can't read it (ComfyUI's own stats have no temperature). */
  tempC: z.number().nullable(),
  /** 0–100; null when unknown. */
  load: z.number().nullable(),
});
export type GpuStats = z.infer<typeof GpuStats>;

export const SystemStats = z.object({
  at: z.number(),
  /** First GPU; null when there is none or nothing could be read. */
  gpu: GpuStats.nullable(),
  source: z.enum(["nvidia-smi", "comfy", "none"]),
});
export type SystemStats = z.infer<typeof SystemStats>;

export const ComfyLogLine = z.object({
  at: z.number(),
  /** sys = a line written by Blombo itself ("Starting ComfyUI…"). */
  stream: z.enum(["out", "err", "sys"]),
  text: z.string(),
});
export type ComfyLogLine = z.infer<typeof ComfyLogLine>;

export const FreeMemoryBody = z.object({
  unloadModels: z.boolean().default(true),
  freeMemory: z.boolean().default(true),
});
export type FreeMemoryBody = z.infer<typeof FreeMemoryBody>;

/** Where a ComfyUI output file lives, as ComfyUI's /view endpoint names it. */
export const ComfyFileRef = z.object({
  filename: z.string().min(1),
  subfolder: z.string().default(""),
  type: z.enum(["output", "temp", "input"]).default("output"),
});
export type ComfyFileRef = z.infer<typeof ComfyFileRef>;

/** URL of a ComfyUI file through Blombo's proxy (works in both web and desktop windows). */
export function comfyViewUrl(ref: ComfyFileRef): string {
  const q = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return `/api/comfy/view?${q.toString()}`;
}
