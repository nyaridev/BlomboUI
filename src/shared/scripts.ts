/**
 * Generate scripts: one click that queues many runs. A script turns the current values into a
 * list of cells, each a set of value overrides; the server queues one job per cell (all with the
 * same seed, so only the thing being compared changes) and, for a matrix or an XY plot, puts the
 * results together into one labeled grid image.
 *
 *   matrix  every combination of a few prompt terms (on or off)
 *   xy      one or two axes: any number or choice parameter, or a prompt search/replace
 *   thumbs  one image per picked model (checkpoints, or LoRAs added to the prompt), saved as that
 *           model's thumbnail in a scope
 *
 * Pure: the server plans with it, the client counts runs and checks values with it.
 */
import { z } from "zod";
import type { Binding } from "./workflow/manifest.ts";

export const SCRIPT_KINDS = ["matrix", "xy", "thumbs"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

/** One click queues at most this many runs. */
export const MAX_SCRIPT_RUNS = 100;
export const MAX_MATRIX_TERMS = 6;

/** Scope names are folder names in data/profiles/<id>/scopes/. */
export const ScopeName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use lowercase letters, numbers and dashes");

export const AxisSpec = z.discriminatedUnion("type", [
  /** A number, choice or model parameter, one cell per value. */
  z.object({
    type: z.literal("binding"),
    binding: z.string().min(1),
    values: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(50),
  }),
  /** Prompt search/replace: the first value is what's searched; each value replaces it. */
  z.object({
    type: z.literal("replace"),
    binding: z.string().min(1),
    values: z.array(z.string().min(1).max(200)).min(1).max(50),
  }),
]);
export type AxisSpec = z.infer<typeof AxisSpec>;

export const MatrixScript = z.object({
  kind: z.literal("matrix"),
  /** The prompt the terms are added to. */
  binding: z.string().min(1).default("prompt.positive"),
  terms: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_MATRIX_TERMS),
  grid: z.boolean().default(true),
});

export const XYScript = z.object({
  kind: z.literal("xy"),
  x: AxisSpec,
  y: AxisSpec.nullable().default(null),
  grid: z.boolean().default(true),
});

export const ThumbsScript = z.object({
  kind: z.literal("thumbs"),
  /** model: swap the model binding; lora: add <lora:…> to the prompt binding. */
  target: z.enum(["model", "lora"]),
  /** The model binding (target model) or the prompt binding (target lora). */
  binding: z.string().min(1),
  /** ComfyUI names ("sd15/dreamshaper_8.safetensors"). */
  models: z.array(z.string().min(1)).min(1).max(MAX_SCRIPT_RUNS),
  scope: ScopeName.default("default"),
  loraWeight: z.number().min(-4).max(4).default(1),
});

export const Script = z.discriminatedUnion("kind", [MatrixScript, XYScript, ThumbsScript]);
export type Script = z.infer<typeof Script>;
export type ScriptInput = z.input<typeof Script>;

/** One run of a script. */
export interface ScriptCell {
  overrides: Record<string, unknown>;
  col: number;
  row: number;
  /** "CFG scale: 7 · Steps: 20". */
  label: string;
  /** For thumbs: the model this run is for. */
  model?: string;
}

export interface ScriptPlan {
  kind: ScriptKind;
  cells: ScriptCell[];
  cols: number;
  rows: number;
  colLabels: string[];
  rowLabels: string[];
  /** Put the results together into a grid image. */
  grid: boolean;
  /** "XY plot · CFG scale × Steps". */
  title: string;
}

export class ScriptError extends Error {}

/* ── values ───────────────────────────────────────────────────────────────── */

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const RANGE = new RegExp(
  `^(${NUM})\\s*(?:-|to|\\.\\.)\\s*(${NUM})(?:\\s*\\(([+-]?\\d+(?:\\.\\d+)?)\\)|\\s*\\[(\\d+)\\])?$`,
);

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** "1-5", "10-30 (+5)", "1-2 [5]" (five values from 1 to 2), or a single number. */
function expandNumber(part: string, integer: boolean): number[] {
  const m = RANGE.exec(part);
  if (!m) {
    const n = Number(part);
    if (!Number.isFinite(n)) throw new ScriptError(`"${part}" isn't a number.`);
    return [integer ? Math.round(n) : n];
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (m[4] !== undefined) {
    const count = Number(m[4]);
    if (count < 1) throw new ScriptError(`"${part}" asks for no values.`);
    if (count > MAX_SCRIPT_RUNS) throw new ScriptError(`"${part}" makes too many values.`);
    if (count === 1) return [integer ? Math.round(a) : a];
    const out = Array.from({ length: count }, (_, i) => round(a + ((b - a) * i) / (count - 1)));
    return integer ? [...new Set(out.map(Math.round))] : out;
  }
  const step = Math.abs(m[3] !== undefined ? Number(m[3]) : 1);
  if (step === 0) throw new ScriptError(`"${part}" has a step of 0.`);
  const dir = b >= a ? 1 : -1;
  const out: number[] = [];
  for (let v = a; dir > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += dir * step) {
    out.push(integer ? Math.round(v) : round(v));
    if (out.length > MAX_SCRIPT_RUNS) throw new ScriptError(`"${part}" makes too many values.`);
  }
  return out;
}

/** Split on commas, keeping "quoted, text" together. */
export function splitList(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter((s) => s !== "");
}

const stem = (name: string) =>
  name
    .replace(/\\/g, "/")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase();

/** A model choice by full name, path without extension, or file name. */
export function matchOption(options: string[], wanted: string): string | undefined {
  const w = wanted.trim().toLowerCase();
  return (
    options.find((o) => o.toLowerCase() === w) ??
    options.find((o) => stem(o) === stem(w)) ??
    options.find((o) => stem(o).split("/").pop() === stem(w).split("/").pop())
  );
}

/**
 * The values of an axis typed into a text box, checked against the binding: numbers (with
 * ranges) for number parameters, ComfyUI's choices for choice and model parameters.
 */
export function parseAxisValues(text: string, binding: Binding): Array<string | number> {
  const parts = splitList(text);
  if (!parts.length) throw new ScriptError(`Type some values for ${binding.label}.`);
  if (binding.type === "int" || binding.type === "seed" || binding.type === "float") {
    const integer = binding.type !== "float";
    return parts.flatMap((p) => expandNumber(p, integer));
  }
  if (binding.type === "enum" || binding.type === "model") {
    const options = binding.options ?? [];
    return parts.map((p) => {
      if (!options.length) return p;
      const found = matchOption(options, p);
      if (!found) throw new ScriptError(`"${p}" isn't one of the choices for ${binding.label}.`);
      return found;
    });
  }
  if (binding.type === "bool") return parts.map((p) => (/^(true|on|yes|1)$/i.test(p) ? 1 : 0));
  return parts;
}

/** Bindings an XY axis can use (numbers, choices, models, and prompts for search/replace). */
export function axisBindings(bindings: Binding[]): Binding[] {
  return bindings.filter(
    (b) =>
      ["int", "float", "seed", "enum", "model", "bool", "prompt", "string"].includes(b.type) &&
      b.role !== "output.image",
  );
}

/* ── planning ─────────────────────────────────────────────────────────────── */

function need(bindings: Binding[], id: string): Binding {
  const b = bindings.find((x) => x.id === id);
  if (!b) throw new ScriptError(`This workflow has no parameter "${id}". Pick another one.`);
  return b;
}

function shortName(model: string): string {
  return (model.replace(/\\/g, "/").split("/").pop() ?? model).replace(/\.[a-z0-9]+$/i, "");
}

function formatValue(b: Binding, v: unknown): string {
  if (b.type === "model") return shortName(String(v));
  if (b.type === "bool") return v ? "on" : "off";
  return String(v);
}

interface AxisCell {
  label: string;
  /** Applied in order: plain values, then text edits on the current prompt. */
  apply: (values: Record<string, unknown>) => void;
}

function axisCells(axis: AxisSpec, bindings: Binding[], values: Record<string, unknown>) {
  const b = need(bindings, axis.binding);
  if (axis.type === "replace") {
    if (b.type !== "prompt" && b.type !== "string")
      throw new ScriptError(`Search and replace works on prompts; ${b.label} isn't one.`);
    const search = axis.values[0] as string;
    const text = String(values[b.id] ?? "");
    if (!text.includes(search))
      throw new ScriptError(
        `"${search}" isn't in ${b.label.toLowerCase()}. The first value is what gets replaced.`,
      );
    return {
      name: `${b.label} search/replace`,
      cells: axis.values.map(
        (v): AxisCell => ({
          label: v,
          apply: (vals) => {
            vals[b.id] = String(vals[b.id] ?? "")
              .split(search)
              .join(v);
          },
        }),
      ),
    };
  }
  if (b.type === "prompt" || b.type === "loras" || b.type === "image")
    throw new ScriptError(`${b.label} can't be an axis. Use search/replace for prompts.`);
  return {
    name: b.label,
    cells: axis.values.map(
      (v): AxisCell => ({
        label: `${b.label}: ${formatValue(b, v)}`,
        apply: (vals) => {
          vals[b.id] = b.type === "bool" ? Boolean(v) : v;
        },
      }),
    ),
  };
}

function checkCount(n: number): void {
  if (n > MAX_SCRIPT_RUNS)
    throw new ScriptError(
      `That's ${n} images; a script can queue ${MAX_SCRIPT_RUNS} at most. Use fewer values.`,
    );
  if (n === 0) throw new ScriptError("The script has nothing to run.");
}

/** Every run a script makes, in the order they're queued (row by row). */
export function planScript(
  input: ScriptInput | Script,
  bindings: Binding[],
  values: Record<string, unknown>,
): ScriptPlan {
  const script = Script.parse(input);

  if (script.kind === "matrix") {
    const b = need(bindings, script.binding);
    if (b.type !== "prompt" && b.type !== "string")
      throw new ScriptError(`A prompt matrix adds terms to a prompt; ${b.label} isn't one.`);
    const terms = script.terms;
    // The first half of the terms go across, the rest down.
    const across = Math.ceil(terms.length / 2);
    const colTerms = terms.slice(0, across);
    const rowTerms = terms.slice(across);
    const subsets = (list: string[]) =>
      Array.from({ length: 2 ** list.length }, (_, mask) => list.filter((_, i) => mask & (1 << i)));
    const cols = subsets(colTerms);
    const rows = rowTerms.length ? subsets(rowTerms) : [[]];
    checkCount(cols.length * rows.length);
    const base = String(values[b.id] ?? "").trim();
    const join = (parts: string[]) => parts.filter(Boolean).join(", ");
    const label = (set: string[]) => (set.length ? set.join(" + ") : "(prompt only)");
    const cells: ScriptCell[] = [];
    rows.forEach((r, row) => {
      cols.forEach((c, col) => {
        cells.push({
          overrides: { [b.id]: join([base, ...c, ...r]) },
          col,
          row,
          label: label([...c, ...r]),
        });
      });
    });
    return {
      kind: "matrix",
      cells,
      cols: cols.length,
      rows: rows.length,
      colLabels: cols.map(label),
      rowLabels: rowTerms.length ? rows.map(label) : [],
      grid: script.grid,
      title: `Prompt matrix · ${terms.length} term${terms.length === 1 ? "" : "s"}`,
    };
  }

  if (script.kind === "xy") {
    const x = axisCells(script.x, bindings, values);
    const y = script.y ? axisCells(script.y, bindings, values) : null;
    const rows = y?.cells ?? [null];
    checkCount(x.cells.length * rows.length);
    const cells: ScriptCell[] = [];
    rows.forEach((ry, row) => {
      x.cells.forEach((cx, col) => {
        const vals = { ...values };
        cx.apply(vals);
        ry?.apply(vals);
        // Every parameter an axis sets, even when it's the current value.
        const overrides: Record<string, unknown> = {};
        for (const id of [script.x.binding, script.y?.binding])
          if (id !== undefined) overrides[id] = vals[id];
        cells.push({
          overrides,
          col,
          row,
          label: [cx.label, ry?.label].filter(Boolean).join(" · "),
        });
      });
    });
    return {
      kind: "xy",
      cells,
      cols: x.cells.length,
      rows: rows.length,
      colLabels: x.cells.map((c) => c.label),
      rowLabels: y ? y.cells.map((c) => c.label) : [],
      grid: script.grid,
      title: `XY plot · ${x.name}${y ? ` × ${y.name}` : ""}`,
    };
  }

  const b = need(bindings, script.binding);
  checkCount(script.models.length);
  if (script.target === "model" && b.type !== "model")
    throw new ScriptError(`${b.label} isn't a model parameter.`);
  if (script.target === "lora" && b.type !== "prompt")
    throw new ScriptError("LoRA thumbnails add the LoRA to a prompt; pick the prompt.");
  const base = String(values[b.id] ?? "").trim();
  const cells = script.models.map(
    (model, i): ScriptCell => ({
      overrides:
        script.target === "model"
          ? { [b.id]: model }
          : {
              [b.id]: [base, `<lora:${model.replace(/\.[a-z0-9]+$/i, "")}:${script.loraWeight}>`]
                .filter(Boolean)
                .join(", "),
            },
      col: i,
      row: 0,
      label: shortName(model),
      model,
    }),
  );
  return {
    kind: "thumbs",
    cells,
    cols: cells.length,
    rows: 1,
    colLabels: cells.map((c) => c.label),
    rowLabels: [],
    grid: false,
    title: `Scope thumbnails · ${cells.length} model${cells.length === 1 ? "" : "s"}`,
  };
}
