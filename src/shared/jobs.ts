/**
 * Generation jobs. The queue lives on the server (it survives a page reload and is shared by
 * every open window); one job is one ComfyUI prompt with its own seed.
 */
import { z } from "zod";
import { ComfyFileRef } from "./comfy.ts";
import { Script } from "./scripts.ts";
import { SeedMode, StagesRecord } from "./workflow/manifest.ts";
import { RunSegment } from "./workflow/stages.ts";

export const JOB_STATES = [
  "queued",
  "running",
  "done",
  "error",
  "interrupted",
  "cancelled",
] as const;
export const JobState = z.enum(JOB_STATES);
export type JobState = z.infer<typeof JobState>;

export const JobImage = ComfyFileRef.extend({ node: z.string() });
export type JobImage = z.infer<typeof JobImage>;

export const JobProgress = z.object({
  /** Steps of the node that is reporting progress (usually a sampler). */
  value: z.number(),
  max: z.number(),
  node: z.string().nullable(),
  /** 0–1 across the whole job. */
  overall: z.number(),
  /** Index into the job's segments of the part that's running. */
  segment: z.number().int().default(0),
  /** Steps per second of the node that's reporting, or null before its second step. */
  rate: z.number().nullable().default(null),
});
export type JobProgress = z.infer<typeof JobProgress>;

/** One part of a run (the base pass, a stage) and how fast it went. */
export const JobTiming = z.object({
  label: z.string(),
  /** Time spent running this part's sampler nodes. */
  ms: z.number(),
  /** Sampler steps it ran. */
  steps: z.number().int(),
  /** Steps per second, or null when it ran no steps. */
  rate: z.number().nullable(),
});
export type JobTiming = z.infer<typeof JobTiming>;

/**
 * Jobs that one click queued together: a script's cells or a batch's files. The script and batch
 * services follow their group and put the results together (a grid, thumbnails, output files).
 */
export const JobGroup = z.object({
  id: z.string(),
  kind: z.enum(["matrix", "xy", "thumbs", "batch", "grid"]),
  /** "XY plot · CFG scale × Steps", "Remove background". */
  title: z.string(),
  /** This job's place in the group (0-based) and the group's size. */
  index: z.number().int(),
  total: z.number().int(),
  /** This job's cell or file ("CFG scale: 7", "IMG_0042.jpg"). */
  label: z.string(),
});
export type JobGroup = z.infer<typeof JobGroup>;

/** A picture Blombo made itself (a script's grid), served from the Blombo server. */
export const JobFile = z.object({
  url: z.string(),
  path: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type JobFile = z.infer<typeof JobFile>;

export const Job = z.object({
  id: z.string(),
  /** Small increasing number; preview frames carry it instead of the id. */
  seq: z.number().int(),
  workflowId: z.string(),
  workflowName: z.string(),
  state: JobState,
  seed: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  /**
   * The parts of the run the progress bar is split into: the workflow's own sampling passes,
   * then each enabled stage ("Hires fix", "ADetailer · Face"). Filled in when it's compiled.
   */
  segments: z.array(RunSegment),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  progress: JobProgress,
  images: z.array(JobImage),
  /** Text a node showed (a tagger's tags, a captioner's caption), in order. */
  texts: z.array(z.string()).default([]),
  /** What went wrong and what to do; set when state is "error". */
  error: z.string().nullable(),
  promptId: z.string().nullable(),
  group: JobGroup.nullable().default(null),
  /** For a script's grid (group kind "grid"): the image Blombo put together. */
  file: JobFile.nullable().default(null),
  /**
   * How long each part took and how fast it sampled, filled in as it runs; the last entry,
   * "Other", is loading models, decoding and saving.
   */
  timings: z.array(JobTiming).default([]),
});
export type Job = z.infer<typeof Job>;

export const QueueSnapshot = z.object({
  /** Running and queued jobs first (in run order), then recently finished ones, newest first. */
  jobs: z.array(Job),
  /** "Generate forever" is on. */
  loop: z.boolean(),
  /** Jobs are waiting because ComfyUI isn't running. */
  waiting: z.boolean(),
});
export type QueueSnapshot = z.infer<typeof QueueSnapshot>;

export const GenerateBody = z.object({
  workflowId: z.string().min(1),
  /** The client's current values; merged over the saved ones so nothing waits for a save. */
  values: z.record(z.string(), z.unknown()).default({}),
  /** The client's current stage settings, saved like the values. */
  stages: StagesRecord.optional(),
  count: z.number().int().min(1).max(100).default(1),
  seedMode: SeedMode.optional(),
  /** Keep queuing new runs (new seeds) until stopped. */
  loop: z.boolean().default(false),
  /** Run a script instead (prompt matrix, XY plot, scope thumbnails); `count` is ignored. */
  script: Script.optional(),
});
export type GenerateBody = z.infer<typeof GenerateBody>;

/** Turn loop mode (keep queuing new seeds) on or off. */
export const LoopBody = z.object({ on: z.boolean() });

export const GenerateResponse = z.object({
  jobs: z.array(Job),
  /** Values the server changed for the next click (the seed, in increment/decrement mode). */
  values: z.record(z.string(), z.unknown()),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
