/**
 * Batch tools (ADR-0003, ADR-0014): `kind: "batch"` workflows run once per input image. One
 * runner (services/batch.ts) feeds each file to the workflow's image input through the server
 * queue, then copies the images it makes into the output folder and writes text outputs
 * (captions, tags) as sidecar .txt files named after the input.
 */
import { z } from "zod";
import { StageProblem } from "./workflow/stages.ts";

/** Input files the runner picks up from a folder. */
export const BATCH_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"] as const;
export const MAX_BATCH_FILES = 5000;

export const BatchFile = z.object({
  /** An absolute path on this machine. */
  path: z.string().min(1).max(2000),
  /** The name outputs are named after (a dropped file's own name); the path's file name if left out. */
  name: z.string().min(1).max(260).optional(),
});
export type BatchFile = z.infer<typeof BatchFile>;

export const BatchSource = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("folder"),
    folder: z.string().min(1).max(2000),
    recursive: z.boolean().default(false),
  }),
  z.object({ type: z.literal("files"), files: z.array(BatchFile).min(1).max(MAX_BATCH_FILES) }),
]);
export type BatchSource = z.infer<typeof BatchSource>;

export const StartBatchBody = z.object({
  workflowId: z.string().min(1),
  /** The client's current values (saved like Generate's). */
  values: z.record(z.string(), z.unknown()).default({}),
  source: BatchSource,
  /** Where results go; created when missing. */
  output: z.string().trim().min(1).max(2000),
  /** Skip inputs whose result is already in the output folder (so a stopped batch resumes). */
  skipExisting: z.boolean().default(true),
  /** Put in front of every text output ("my_trigger, …"). */
  captionPrefix: z.string().max(200).default(""),
});
export type StartBatchBody = z.infer<typeof StartBatchBody>;

export const BATCH_ITEM_STATES = [
  "queued",
  "running",
  "done",
  "skipped",
  "error",
  "cancelled",
] as const;

export const BatchItem = z.object({
  index: z.number().int(),
  /** Relative to the folder (or the file name), for display. */
  name: z.string(),
  /** Its job in the server queue (live progress comes for that job). */
  jobId: z.string().nullable(),
  state: z.enum(BATCH_ITEM_STATES),
  /** 0–1 while running. */
  progress: z.number(),
  /** File names written into the output folder. */
  outputs: z.array(z.string()),
  error: z.string().nullable(),
});
export type BatchItem = z.infer<typeof BatchItem>;

export const BatchRun = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  state: z.enum(["running", "done", "cancelled", "error"]),
  /** "D:\\shots (42 images)" or "12 files". */
  sourceLabel: z.string(),
  output: z.string(),
  items: z.array(BatchItem),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  /** Set when the whole batch stopped (ComfyUI went away, the output folder can't be written). */
  error: z.string().nullable(),
});
export type BatchRun = z.infer<typeof BatchRun>;

/** GET /api/batch: the current (or last) batch. */
export const BatchSnapshot = z.object({ run: BatchRun.nullable() });
export type BatchSnapshot = z.infer<typeof BatchSnapshot>;

/** POST /api/batch/files: a dropped file, staged on the server. */
export const StagedFile = BatchFile.required();
export type StagedFile = z.infer<typeof StagedFile>;

export function batchCounts(run: BatchRun): Record<BatchItem["state"], number> {
  const out = { queued: 0, running: 0, done: 0, skipped: 0, error: 0, cancelled: 0 };
  for (const item of run.items) out[item.state]++;
  return out;
}

/** GET /api/batch/check/:workflowId: what a batch workflow is missing before it can run. */
export const BatchCheck = z.object({
  /** False while ComfyUI is down: nodes and models couldn't be checked. */
  checked: z.boolean(),
  problems: z.array(StageProblem),
  /** The workflow makes images (written as <name>.png). */
  makesImages: z.boolean(),
  /** The workflow shows text, a caption or tags (written as <name>.txt). */
  makesText: z.boolean(),
});
export type BatchCheck = z.infer<typeof BatchCheck>;
