/**
 * Compare: saved comparisons that try every combination of a few settings. A comparison keeps
 * the settings it starts from (Generate's values and stages when it was made) and any number of
 * rows, each a setting with the values to try (the XY plot's axes, shared/scripts.ts). Three
 * samplers × three schedulers × CFG 4, 5, 6 is 27 images, one seed for all of them, so only what's
 * compared changes. The images go to the outputs folder and the gallery like any run; the
 * comparison keeps which image is which combination (`results`, by `cellKey`), so adding a
 * value later only runs the new combinations.
 *
 * Pure: the server plans the runs with it, the Compare view counts them and lays out the grid.
 */
import { z } from "zod";
import {
  type Axis,
  AxisDraft,
  axisCells,
  axisFromDraft,
  axisName,
  type LoraWeight,
  ScriptError,
} from "./scripts.ts";
import { type Binding, StagesRecord } from "./workflow/manifest.ts";

/** Rows (settings to compare) one comparison can have. */
export const MAX_COMPARE_AXES = 8;
/** One comparison makes at most this many images. */
export const MAX_COMPARE_RUNS = 500;

export const COMPARE_RESULT_STATES = ["queued", "running", "done", "error", "cancelled"] as const;
export type CompareResultState = (typeof COMPARE_RESULT_STATES)[number];

/** A finished image, as the gallery indexed it. */
export const CompareImage = z.object({
  /** The gallery's id. */
  id: z.number().int(),
  thumb: z.string(),
  /** The full-size file. */
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  name: z.string(),
});
export type CompareImage = z.infer<typeof CompareImage>;

/** One combination's run. */
export const CompareResult = z.object({
  /** Which combination (`cellKey`). */
  key: z.string(),
  state: z.enum(COMPARE_RESULT_STATES),
  seed: z.number().nullable().default(null),
  /** The image; while a combination runs again, the one before it. */
  image: CompareImage.nullable().default(null),
  error: z.string().nullable().default(null),
  at: z.string(),
});
export type CompareResult = z.infer<typeof CompareResult>;

export const COMPARE_FORMAT = "blombo.compare/1";

/** A comparison, saved as compare/<id>.json in the profile's folder. */
export const CompareTask = z.object({
  format: z.literal(COMPARE_FORMAT).default(COMPARE_FORMAT),
  id: z.string(),
  /** Empty: the view names it after its rows ("Sampler × Scheduler × CFG scale"). */
  name: z.string().max(120).default(""),
  workflowId: z.string(),
  workflowName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** The settings every image starts from. */
  values: z.record(z.string(), z.unknown()).default({}),
  stages: StagesRecord.nullable().default(null),
  /** The settings to compare, in order (the first is across, the second down, at first). */
  axes: z.array(AxisDraft).max(MAX_COMPARE_AXES).default([]),
  /** The seed every image shares; null picks one when it starts. */
  seed: z.number().int().min(0).nullable().default(null),
  /** A new random seed for each image instead. */
  randomSeeds: z.boolean().default(false),
  running: z.boolean().default(false),
  results: z.array(CompareResult).default([]),
});
export type CompareTask = z.infer<typeof CompareTask>;

/** A new comparison, from Generate's current workflow, values and stages. */
export const NewCompareBody = z.object({
  workflowId: z.string().min(1),
  values: z.record(z.string(), z.unknown()).default({}),
  stages: StagesRecord.optional(),
  name: z.string().trim().max(120).default(""),
  axes: z.array(AxisDraft).max(MAX_COMPARE_AXES).default([]),
});
export type NewCompareBody = z.infer<typeof NewCompareBody>;
export type NewCompareInput = z.input<typeof NewCompareBody>;

/** What can change on a comparison that isn't running. */
export const CompareUpdate = z
  .object({
    name: z.string().trim().max(120),
    axes: z.array(AxisDraft).max(MAX_COMPARE_AXES),
    seed: z.number().int().min(0).nullable(),
    randomSeeds: z.boolean(),
    /** Take Generate's settings now (its images no longer match them, so they're cleared). */
    base: NewCompareBody.pick({ workflowId: true, values: true, stages: true }),
  })
  .partial();
export type CompareUpdate = z.infer<typeof CompareUpdate>;
export type CompareUpdateInput = z.input<typeof CompareUpdate>;

export const StartCompareBody = z.object({
  /** missing: only the combinations without an image; all: every one again. */
  mode: z.enum(["missing", "all"]).default("missing"),
});

/* ── planning ─────────────────────────────────────────────────────────────── */

export interface CompareAxis {
  /** "Sampler". */
  name: string;
  /** Each value: alone ("euler") and with its setting ("Sampler: euler"). */
  values: Array<{ value: string; label: string }>;
}

export interface CompareCell {
  key: string;
  /** The value index on each axis. */
  coords: number[];
  /** The values this combination sets. */
  overrides: Record<string, unknown>;
  /** "Sampler: euler · CFG scale: 5". */
  label: string;
}

export interface ComparePlan {
  axes: CompareAxis[];
  cells: CompareCell[];
}

/** A combination's key: each axis's setting and value, in any order (rows can move). */
export function cellKey(parts: Array<{ axis: string; value: string }>): string {
  return parts
    .map((p) => `${p.axis}=${p.value}`)
    .sort()
    .join("\n");
}

/**
 * Every combination of the rows, the first row's values changing fastest. Rows with no type
 * are skipped; a value listed twice counts once. Throws ScriptError with what to fix.
 */
export function planCompare(
  drafts: AxisDraft[],
  bindings: Binding[],
  values: Record<string, unknown>,
  weight: LoraWeight | null,
): ComparePlan {
  const axes: Axis[] = [];
  for (const draft of drafts) {
    const spec = axisFromDraft(draft, bindings, axisName(draft.type, bindings), weight);
    if (!spec) continue;
    const axis = axisCells(spec, bindings, values);
    const seen = new Set<string>();
    axis.cells = axis.cells.filter((c) => !seen.has(c.value) && seen.add(c.value));
    // Only LoRAs and Prompt S/R can be compared twice (different LoRAs, different words).
    if (axis.key !== "lora" && axis.key !== "replace" && axes.some((a) => a.key === axis.key))
      throw new ScriptError(`${axis.name} is in two rows. Put all its values in one.`);
    axes.push(axis);
  }
  if (!axes.length) throw new ScriptError("Add a setting to compare and the values to try.");
  const total = axes.reduce((n, a) => n * a.cells.length, 1);
  if (total > MAX_COMPARE_RUNS)
    throw new ScriptError(
      `That's ${total.toLocaleString()} images; a comparison makes ${MAX_COMPARE_RUNS} at most. Use fewer values.`,
    );

  const cells: CompareCell[] = [];
  const coords = axes.map(() => 0);
  for (let n = 0; n < total; n++) {
    const vals = { ...values };
    const ids: string[] = [];
    const parts: Array<{ axis: string; value: string }> = [];
    const labels: string[] = [];
    axes.forEach((axis, i) => {
      const cell = axis.cells[coords[i] ?? 0];
      if (!cell) return;
      ids.push(...cell.apply(vals));
      // Two LoRA (or S/R) rows: the row's place tells them apart.
      const first = axes.findIndex((x) => x.key === axis.key) === i;
      parts.push({ axis: first ? axis.key : `${axis.key}${i}`, value: cell.value });
      labels.push(cell.label);
    });
    const overrides: Record<string, unknown> = {};
    for (const id of ids) overrides[id] = vals[id];
    cells.push({ key: cellKey(parts), coords: [...coords], overrides, label: labels.join(" · ") });
    // Next combination: the first row moves fastest.
    for (let i = 0; i < axes.length; i++) {
      coords[i] = (coords[i] ?? 0) + 1;
      if ((coords[i] ?? 0) < (axes[i]?.cells.length ?? 0)) break;
      coords[i] = 0;
    }
  }
  return {
    axes: axes.map((a) => ({
      name: a.name,
      values: a.cells.map((c) => ({ value: c.value, label: c.label })),
    })),
    cells,
  };
}

/** "Sampler × Scheduler × CFG scale", for a comparison without a name. */
export function compareTitle(
  task: Pick<CompareTask, "name" | "axes">,
  bindings: Binding[],
): string {
  if (task.name) return task.name;
  const names = task.axes.filter((a) => a.type !== "none").map((a) => axisName(a.type, bindings));
  return names.length ? names.join(" × ") : "New comparison";
}
