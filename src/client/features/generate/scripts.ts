/**
 * The script the Generate button runs (shared/scripts.ts): what the Scripts block edits, kept per
 * window like other Generate UI state. `buildScript` turns the draft into the request's script
 * and plans it against the current values, so the block can show how many images it makes and
 * what's wrong before anything is queued.
 */

import { comfyNameOf, type ModelList } from "@shared/models";
import {
  axisBindings,
  type MatrixInsert,
  parseAxisValues,
  planScript,
  type Script,
  ScriptError,
  type ScriptPlan,
  splitList,
} from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { create } from "zustand";

export type ScriptChoice = "matrix" | "xy";

/**
 * What an axis changes: "none", "replace" (prompt S/R), "resolution", "lora", or a binding id.
 * Models and LoRAs are picked as tiles (`picks`), choices from a list (`picks`), the rest typed
 * (`text`).
 */
export interface AxisDraft {
  type: string;
  text: string;
  picks: string[];
}

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

export const NO_AXIS: AxisDraft = { type: "none", text: "", picks: [] };

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
  loraWeight: (file: string) => number | null;
}

/** Each local LoRA's saved strength, by ComfyUI name. */
export function loraWeights(list: ModelList | undefined): BuildContext["loraWeight"] {
  const key = (file: string) => file.replace(/\\/g, "/").toLowerCase();
  const map = new Map(
    (list?.models ?? [])
      .filter((m) => m.kind === "loras")
      .map((m) => [key(comfyNameOf(m)), m.weight]),
  );
  return (file) => map.get(key(file)) ?? null;
}

/** Without an extension, as LoRA tags and instant LoRAs name a LoRA. */
export const loraName = (file: string) =>
  file.replace(/\\/g, "/").replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");

/** How an axis type takes its values. */
export function axisInput(type: string, bindings: Binding[]): "none" | "models" | "list" | "text" {
  if (type === "none") return "none";
  if (type === "lora") return "models";
  if (type === "resolution") return "list";
  if (type === "replace") return "text";
  const b = bindings.find((x) => x.id === type);
  if (b?.type === "model") return "models";
  if (b?.type === "enum" || b?.type === "bool") return "list";
  return "text";
}

function axis(
  draft: AxisDraft,
  bindings: Binding[],
  name: string,
  ctx: BuildContext,
  loraStrength: boolean,
): unknown {
  const kind = axisInput(draft.type, bindings);
  if (kind === "none") return null;
  const picks = draft.picks.filter(Boolean);
  if ((kind === "models" || kind === "list") && !picks.length)
    throw new ScriptError(`Pick the values for ${name}.`);
  if (draft.type === "lora")
    return {
      type: "lora",
      values: picks.map((file) => ({
        name: loraName(file),
        strength: (loraStrength ? ctx.loraWeight(file) : null) ?? 1,
      })),
    };
  if (draft.type === "resolution") return { type: "resolution", values: picks };
  if (draft.type === "replace") {
    const values = splitList(draft.text.replace(/\n/g, ","));
    if (!values.length) throw new ScriptError(`Type the text to find for ${name}, then its swaps.`);
    return { type: "replace", values };
  }
  const b = bindings.find((x) => x.id === draft.type);
  if (!b) throw new ScriptError(`Pick a type for ${name}.`);
  if (b.type === "bool") return { type: "binding", binding: b.id, values: picks.map(Number) };
  if (kind === "models" || kind === "list")
    return { type: "binding", binding: b.id, values: picks };
  return { type: "binding", binding: b.id, values: parseAxisValues(draft.text, b) };
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
        x: axis(xy.x, bindings, "X", ctx, xy.loraStrength),
        y: axis(xy.y, bindings, "Y", ctx, xy.loraStrength),
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
