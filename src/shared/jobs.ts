/**
 * Generation jobs. The queue lives on the server (it survives a page reload and is shared by
 * every open window); one job is one ComfyUI prompt with its own seed.
 */
import { z } from "zod";
import { ComfyFileRef } from "./comfy.ts";
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
});
export type JobProgress = z.infer<typeof JobProgress>;

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
  /** What went wrong and what to do; set when state is "error". */
  error: z.string().nullable(),
  promptId: z.string().nullable(),
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
});
export type GenerateBody = z.infer<typeof GenerateBody>;

export const GenerateResponse = z.object({
  jobs: z.array(Job),
  /** Values the server changed for the next click (the seed, in increment/decrement mode). */
  values: z.record(z.string(), z.unknown()),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
