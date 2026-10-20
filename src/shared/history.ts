/**
 * The job log and what's built on it: every run that left the queue is a row in the profile
 * database (ADR-0006), with the values it ran with (so it can run again), how long each part
 * took, and the models, LoRAs and wildcards it used. Settings → Overview, History →
 * Generations, prompt history and the pickers' "recent" models all read it.
 */
import { z } from "zod";
import { MODEL_KINDS } from "./constants.ts";
import { JobState, JobTiming } from "./jobs.ts";
import { StagesRecord } from "./workflow/manifest.ts";

export const JOB_KINDS = ["generate", "matrix", "xy", "thumbs", "batch", "grid"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JobRecord = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  kind: z.enum(JOB_KINDS),
  state: JobState,
  seed: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  images: z.number().int(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number(),
  /** From start to finish: time ComfyUI spent on it. */
  durationMs: z.number().nullable(),
  model: z.string().nullable(),
  loras: z.array(z.string()),
  wildcards: z.array(z.string()),
  prompt: z.string().nullable(),
  negative: z.string().nullable(),
  timings: z.array(JobTiming),
  error: z.string().nullable(),
  /** The script or batch it belonged to ("XY plot · CFG × Steps"). */
  groupTitle: z.string().nullable(),
  /** Thumbnail of its first image when the gallery has it. */
  thumb: z.string().nullable(),
  /** Gallery id of its first image, for the lightbox. */
  imageId: z.number().int().nullable(),
});
export type JobRecord = z.infer<typeof JobRecord>;

/** What "Run again" and "Use these settings" need, kept out of the list rows. */
export const JobRecordDetail = JobRecord.extend({
  values: z.record(z.string(), z.unknown()),
  stages: StagesRecord.nullable(),
});
export type JobRecordDetail = z.infer<typeof JobRecordDetail>;

export const JobHistoryQuery = z.object({
  q: z.string().trim().max(200).default(""),
  workflowId: z.string().max(200).optional(),
  state: z.enum(["all", "done", "failed"]).default("all"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type JobHistoryQueryInput = z.input<typeof JobHistoryQuery>;

export const JobHistoryPage = z.object({
  items: z.array(JobRecord),
  total: z.number().int(),
  offset: z.number().int(),
});
export type JobHistoryPage = z.infer<typeof JobHistoryPage>;

export const Usage = z.object({ name: z.string(), count: z.number().int() });
export type Usage = z.infer<typeof Usage>;

/** Settings → Overview. Generated counts come from the job log; the gallery adds its own. */
export const UsageStats = z.object({
  generated: z.object({
    total: z.number().int(),
    week: z.number().int(),
    today: z.number().int(),
  }),
  /** Images generated per local day, the last 14 days, oldest first (today last). */
  perDay: z.array(z.object({ day: z.string(), count: z.number().int() })),
  gpuMs: z.object({ total: z.number(), week: z.number() }),
  runs: z.object({ total: z.number().int(), failed: z.number().int() }),
  /** Average steps per second of finished runs this week, or null. */
  rate: z.number().nullable(),
  models: z.array(Usage),
  loras: z.array(Usage),
  wildcards: z.array(Usage),
  workflows: z.array(Usage),
  firstAt: z.number().nullable(),
  /** From the gallery's index: everything in the libraries, and the hearts. */
  gallery: z.object({ images: z.number().int(), favorites: z.number().int() }),
});
export type UsageStats = z.infer<typeof UsageStats>;

export const PromptHistoryEntry = z.object({
  text: z.string(),
  uses: z.number().int(),
  lastUsed: z.number(),
});
export type PromptHistoryEntry = z.infer<typeof PromptHistoryEntry>;

/** What the model pickers show first. */
export const ModelMarks = z.object({
  /** Favorite models as "<kind>/<ComfyUI name>". */
  favorites: z.array(z.string()),
  /** ComfyUI names of models and LoRAs used most recently, newest first. */
  recent: z.array(z.string()),
});
export type ModelMarks = z.infer<typeof ModelMarks>;

export const ModelFavoriteBody = z.object({
  kind: z.enum(MODEL_KINDS),
  name: z.string().min(1).max(400),
  favorite: z.boolean(),
});

/** A reusable prompt fragment, kept in the profile's snippets.json. */
export const Snippet = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(60),
  text: z.string().max(4000),
});
export type Snippet = z.infer<typeof Snippet>;

export const SnippetsFile = z.object({
  format: z.literal("blombo.snippets/1").default("blombo.snippets/1"),
  snippets: z.array(Snippet).max(500).default([]),
});
export type SnippetsFile = z.infer<typeof SnippetsFile>;

export const SaveSnippetBody = z.object({
  id: Snippet.shape.id.optional(),
  name: Snippet.shape.name,
  text: Snippet.shape.text.min(1),
});
export type SaveSnippetBody = z.infer<typeof SaveSnippetBody>;

/** Steps per second over a set of timings (null when nothing ran a step). */
export function averageRate(timings: JobTiming[]): number | null {
  let steps = 0;
  let ms = 0;
  for (const t of timings)
    if (t.steps > 0 && t.ms > 0) {
      steps += t.steps;
      ms += t.ms;
    }
  return ms > 0 ? steps / (ms / 1000) : null;
}

/** "3.2 s", "1 min 04 s", "2 h 05 min". */
export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")} min`;
}
