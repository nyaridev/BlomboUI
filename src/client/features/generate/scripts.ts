/**
 * The script the Generate button runs (shared/scripts.ts): what the Scripts block edits, kept per
 * window like other Generate UI state. `buildScript` turns the draft into the request's script
 * and plans it against the current values, so the block can show how many images it makes and
 * what's wrong before anything is queued.
 */
import {
  axisBindings,
  MAX_MATRIX_TERMS,
  parseAxisValues,
  planScript,
  type Script,
  ScriptError,
  type ScriptPlan,
} from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { create } from "zustand";

export type ScriptChoice = "off" | "matrix" | "xy" | "thumbs";

/** An axis: a binding id, or "sr:<binding id>" for a prompt search/replace. */
export interface AxisDraft {
  source: string;
  text: string;
}

export interface ScriptDraft {
  kind: ScriptChoice;
  matrix: { binding: string; terms: string };
  x: AxisDraft;
  y: AxisDraft | null;
  grid: boolean;
  thumbs: { target: "model" | "lora"; models: string[]; scope: string; loraWeight: number };
}

export const SCRIPT_LABELS: Record<Exclude<ScriptChoice, "off">, string> = {
  matrix: "Prompt matrix",
  xy: "XY plot",
  thumbs: "Scope thumbnails",
};

const initial: ScriptDraft = {
  kind: "off",
  matrix: { binding: "prompt.positive", terms: "" },
  x: { source: "sampler.cfg", text: "4, 6, 8" },
  y: null,
  grid: true,
  thumbs: { target: "model", models: [], scope: "default", loraWeight: 1 },
};

export const useScript = create<{
  draft: ScriptDraft;
  set: (patch: Partial<ScriptDraft>) => void;
}>((set, get) => ({
  draft: initial,
  set: (patch) => set({ draft: { ...get().draft, ...patch } }),
}));

export interface BuiltScript {
  script: Script | null;
  plan: ScriptPlan | null;
  error: string | null;
}

function axis(draft: AxisDraft, bindings: Binding[]): unknown {
  if (draft.source.startsWith("sr:")) {
    const values = draft.text
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    return { type: "replace", binding: draft.source.slice(3), values };
  }
  const b = bindings.find((x) => x.id === draft.source);
  if (!b) throw new ScriptError("Pick a parameter for each axis.");
  return { type: "binding", binding: b.id, values: parseAxisValues(draft.text, b) };
}

/** The draft as a script, planned against these values; null script when the script is off. */
export function buildScript(
  draft: ScriptDraft,
  bindings: Binding[],
  values: Record<string, unknown>,
): BuiltScript {
  if (draft.kind === "off") return { script: null, plan: null, error: null };
  try {
    let input: unknown;
    if (draft.kind === "matrix") {
      const terms = draft.matrix.terms
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      if (!terms.length) throw new ScriptError("Add a term to try, one per line.");
      if (terms.length > MAX_MATRIX_TERMS)
        throw new ScriptError(`A matrix takes ${MAX_MATRIX_TERMS} terms at most.`);
      input = { kind: "matrix", binding: draft.matrix.binding, terms, grid: draft.grid };
    } else if (draft.kind === "xy") {
      input = {
        kind: "xy",
        x: axis(draft.x, bindings),
        y: draft.y ? axis(draft.y, bindings) : null,
        grid: draft.grid,
      };
    } else {
      const t = draft.thumbs;
      if (!t.models.length) throw new ScriptError("Pick the models to make thumbnails for.");
      const binding =
        t.target === "lora"
          ? bindings.find((b) => b.role === "prompt.positive")?.id
          : (
              bindings.find((b) => b.role === "model.checkpoint") ??
              bindings.find((b) => b.role === "model.unet")
            )?.id;
      if (!binding)
        throw new ScriptError(
          t.target === "lora"
            ? "This workflow has no prompt to add LoRAs to."
            : "This workflow has no model to swap.",
        );
      input = {
        kind: "thumbs",
        target: t.target,
        binding,
        models: t.models,
        scope: t.scope.trim() || "default",
        loraWeight: t.loraWeight,
      };
    }
    const plan = planScript(input as Script, bindings, values);
    return { script: input as Script, plan, error: null };
  } catch (error) {
    if (error instanceof ScriptError) return { script: null, plan: null, error: error.message };
    // Zod: a value the schema refuses (a scope name, too many values).
    const issue = (error as { issues?: Array<{ message: string }> }).issues?.[0];
    return { script: null, plan: null, error: issue?.message ?? String(error) };
  }
}

/** What an axis can be: number, choice and model parameters, and prompts (search/replace). */
export function axisOptions(
  bindings: Binding[],
): Array<{ value: string; label: string; group: string }> {
  return axisBindings(bindings)
    .filter((b) => !b.hidden || b.role)
    .map((b) =>
      b.type === "prompt" || b.type === "string"
        ? { value: `sr:${b.id}`, label: `${b.label}: search/replace`, group: "Text" }
        : { value: b.id, label: b.label, group: b.type === "model" ? "Models" : "Parameters" },
    );
}

/** How to type values for an axis. */
export function axisHint(source: string, bindings: Binding[]): string {
  if (source.startsWith("sr:"))
    return "The first value is the text to find in the prompt; each value replaces it (comma or one per line).";
  const b = bindings.find((x) => x.id === source);
  if (!b) return "";
  if (b.type === "int" || b.type === "seed") return "Numbers or ranges: 20, 30, 40 · 10-50 (+10)";
  if (b.type === "float") return "Numbers or ranges: 4, 6.5, 8 · 3-9 [4] (four values from 3 to 9)";
  if (b.type === "bool") return "on, off";
  return "Choices, separated by commas";
}
