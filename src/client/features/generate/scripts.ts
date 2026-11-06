/**
 * The script the Generate button runs (shared/scripts.ts): what the Scripts block edits, kept per
 * window like other Generate UI state. `buildScript` turns the draft into the request's script
 * and plans it against the current values, so the block can show how many images it makes and
 * what's wrong before anything is queued.
 */

import {
  type AxisDraft,
  axisBindings,
  axisFromDraft,
  type LoraWeight,
  type MatrixInsert,
  NO_AXIS,
  planScript,
  type Script,
  ScriptError,
  type ScriptPlan,
} from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { create } from "zustand";

export type ScriptChoice = "matrix" | "xy";

export interface ScriptDraft {
  on: boolean;
  kind: ScriptChoice;
  matrix: {
    binding: string;
    insert: MatrixInsert;
    search: string;
    lines: string;
    useBatch: boolean;
    grid: boolean;
  };
  xy: {
    x: AxisDraft;
    y: AxisDraft;
    legend: boolean;
    legendType: boolean;
    randomSeeds: boolean;
    keepImages: boolean;
    margin: number;
    /** LoRAs at the strength their model info saves (otherwise 1). */
    loraStrength: boolean;
  };
}

export const SCRIPT_LABELS: Record<ScriptChoice, string> = {
  matrix: "Prompt matrix",
  xy: "XY plot",
};

export const initialScript: ScriptDraft = {
  on: false,
  kind: "xy",
  matrix: {
    binding: "prompt.positive",
    insert: "end",
    search: "",
    lines: "",
    useBatch: false,
    grid: true,
  },
  xy: {
    x: { type: "sampler.cfg", text: "4, 6, 8", picks: [] },
    y: NO_AXIS,
    legend: true,
    legendType: false,
    randomSeeds: false,
    keepImages: true,
    margin: 0,
    loraStrength: true,
  },
};

export const useScript = create<{
  draft: ScriptDraft;
  set: (patch: Partial<ScriptDraft>) => void;
  setXY: (patch: Partial<ScriptDraft["xy"]>) => void;
  setMatrix: (patch: Partial<ScriptDraft["matrix"]>) => void;
}>((set, get) => ({
  draft: initialScript,
  set: (patch) => set({ draft: { ...get().draft, ...patch } }),
  setXY: (patch) => set({ draft: { ...get().draft, xy: { ...get().draft.xy, ...patch } } }),
  setMatrix: (patch) =>
    set({ draft: { ...get().draft, matrix: { ...get().draft.matrix, ...patch } } }),
}));

export interface BuiltScript {
  script: Script | null;
  plan: ScriptPlan | null;
  error: string | null;
}

/** What else building a script needs: the batch count, and a LoRA's saved strength. */
export interface BuildContext {
  count: number;
  loraWeight: LoraWeight;
}

/** The draft as a script, planned against these values; null script when the script is off. */
export function buildScript(
  draft: ScriptDraft,
  bindings: Binding[],
  values: Record<string, unknown>,
  ctx: BuildContext,
): BuiltScript {
  if (!draft.on) return { script: null, plan: null, error: null };
  try {
    let input: unknown;
    if (draft.kind === "matrix") {
      const m = draft.matrix;
      const lines = m.lines
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!lines.length) throw new ScriptError("Add the lines to try, one per line.");
      input = {
        kind: "matrix",
        binding: m.binding,
        lines,
        insert: m.insert,
        search: m.search,
        useBatch: m.useBatch,
        count: ctx.count,
        grid: m.grid,
      };
    } else {
      const xy = draft.xy;
      input = {
        kind: "xy",
        x: axisFromDraft(xy.x, bindings, "X", xy.loraStrength ? ctx.loraWeight : null),
        y: axisFromDraft(xy.y, bindings, "Y", xy.loraStrength ? ctx.loraWeight : null),
        legend: xy.legend,
        legendType: xy.legendType,
        randomSeeds: xy.randomSeeds,
        keepImages: xy.keepImages,
        margin: xy.margin,
      };
    }
    const plan = planScript(input as Script, bindings, values);
    return { script: input as Script, plan, error: null };
  } catch (error) {
    if (error instanceof ScriptError) return { script: null, plan: null, error: error.message };
    // Zod: a value the schema refuses (too many values, a size it can't read).
    const issue = (error as { issues?: Array<{ message: string }> }).issues?.[0];
    return { script: null, plan: null, error: issue?.message ?? String(error) };
  }
}

/** Only LoRAs and Prompt S/R can be on both axes. */
const SHARED_TYPES = new Set(["lora", "replace"]);

/**
 * The types an axis can be, from what the workflow has: its model loaders, LoRAs, the
 * resolution, its number and choice parameters, and Prompt S/R. The other axis's type is left
 * out unless both can share it.
 */
export function axisTypes(
  bindings: Binding[],
  other: string,
): Array<{ value: string; label: string; group?: string }> {
  const prompt = bindings.some((b) => b.type === "prompt");
  const size =
    bindings.some((b) => b.role === "latent.width") &&
    bindings.some((b) => b.role === "latent.height");
  const usable = axisBindings(bindings);
  const out: Array<{ value: string; label: string; group?: string }> = [
    { value: "none", label: "None" },
    ...usable
      .filter((b) => b.type === "model")
      .map((b) => ({ value: b.id, label: b.label, group: "Models" })),
    ...(prompt ? [{ value: "lora", label: "LoRA", group: "Models" }] : []),
    ...(size ? [{ value: "resolution", label: "Resolution", group: "Settings" }] : []),
    ...usable
      .filter((b) => b.type !== "model")
      .map((b) => ({ value: b.id, label: b.label, group: "Settings" })),
    ...(prompt ? [{ value: "replace", label: "Prompt S/R", group: "Prompt" }] : []),
  ];
  return out.filter((o) => o.value === "none" || o.value !== other || SHARED_TYPES.has(o.value));
}
