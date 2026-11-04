/**
 * Generate scripts: one click that queues many runs. A script turns the current values into a
 * list of cells, each a set of value overrides; the server queues one job per cell (with the
 * same seed unless the script says otherwise, so only the thing being compared changes) and,
 * for a matrix or an XY plot, puts the results together into one labeled grid image.
 *
 *   matrix  one run per line (or the batch count per line), each line added at the start or the
 *           end of a prompt, or replacing a word in the prompts
 *   xy      one or two axes, each a type the workflow has: any model loader, a LoRA, a number or
 *           choice parameter, the resolution, or a prompt search/replace
 *   thumbs  one image per picked model, saved as that model's picture (no UI for now)
 *
 * Pure: the server plans with it, the client counts runs and checks values with it.
 */
import { z } from "zod";
import { INSTANT_LORAS, InstantLora, readInstantLoras } from "./prompt/instant.ts";
import type { Binding } from "./workflow/manifest.ts";

export const SCRIPT_KINDS = ["matrix", "xy", "thumbs"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

/** One click queues at most this many runs. */
export const MAX_SCRIPT_RUNS = 100;
/** Grid margins (px between cells) go up to this. */
export const MAX_GRID_MARGIN = 256;

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
    values: z.array(z.string().min(1).max(200)).min(1).max(50),
  }),
  /** Width and height together ("832x1216"). */
  z.object({
    type: z.literal("resolution"),
    values: z
      .array(z.string().regex(/^\d{2,5}\s*[x×]\s*\d{2,5}$/i, "Write sizes as 832x1216."))
      .min(1)
      .max(50),
  }),
  /** Each LoRA joins the instant LoRAs (its trigger words with it). */
  z.object({
    type: z.literal("lora"),
    values: z.array(InstantLora).min(1).max(50),
  }),
]);
export type AxisSpec = z.infer<typeof AxisSpec>;

export const MATRIX_INSERTS = ["start", "end", "replace"] as const;
export type MatrixInsert = (typeof MATRIX_INSERTS)[number];

export const MatrixScript = z.object({
  kind: z.literal("matrix"),
  /** The prompt the lines go into (start / end). */
  binding: z.string().min(1).default("prompt.positive"),
  lines: z.array(z.string().trim().min(1).max(2000)).min(1).max(MAX_SCRIPT_RUNS),
  insert: z.enum(MATRIX_INSERTS).default("end"),
  /** replace: the text each line replaces, in every prompt that has it. */
  search: z.string().max(200).default(""),
  /** Each line runs `count` times at the workflow's batch size; otherwise once, one image. */
  useBatch: z.boolean().default(false),
  count: z.number().int().min(1).max(MAX_SCRIPT_RUNS).default(1),
  grid: z.boolean().default(true),
});

export const XYScript = z.object({
  kind: z.literal("xy"),
  x: AxisSpec.nullable().default(null),
  y: AxisSpec.nullable().default(null),
  /** Labels and a title on the grid. */
  legend: z.boolean().default(true),
  /** Labels name the type too ("Steps: 20" instead of "20"). */
  legendType: z.boolean().default(false),
  /** Every image gets a random seed instead of sharing one. */
  randomSeeds: z.boolean().default(false),
  /** Keep each image in the outputs folder; off, only the grid is saved. */
  keepImages: z.boolean().default(true),
  margin: z.number().int().min(0).max(MAX_GRID_MARGIN).default(0),
});

export const ThumbsScript = z.object({
  kind: z.literal("thumbs"),
  /**
   * model: swap the model binding; lora: run each LoRA as the only instant LoRA, so its trigger
   * words go into the prompt binding's text (tags written in the prompt stay).
   */
  target: z.enum(["model", "lora"]),
  /** The model binding (target model) or the prompt binding (target lora). */
  binding: z.string().min(1),
  /** ComfyUI names ("sd15/dreamshaper_8.safetensors"). */
  models: z.array(z.string().min(1)).min(1).max(MAX_SCRIPT_RUNS),
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
  /** The nth run of the same values (a matrix line's batch count): its seed moves on by n. */
  repeat?: number;
}

export interface ScriptPlan {
  kind: ScriptKind;
  cells: ScriptCell[];
  cols: number;
  rows: number;
  colLabels: string[];
  rowLabels: string[];
  /** A caption under each cell (row by row), for grids whose cells aren't a table. */
  captions?: string[];
  /** Put the results into a grid image. */
  grid: boolean;
  /** Draw the title on the grid. */
  legend: boolean;
  margin: number;
  /** Save each run's image (off: the runs only preview, the grid is what's kept). */
  keepImages: boolean;
  randomSeeds: boolean;
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

/** Parameters an XY axis can set one value at a time (numbers, choices, models, switches). */
export function axisBindings(bindings: Binding[]): Binding[] {
  return bindings.filter(
    (b) =>
      ["int", "float", "seed", "enum", "model", "bool"].includes(b.type) &&
      b.role !== "output.image" &&
      (!b.hidden || b.role),
  );
}

/** "832x1216" → [832, 1216]. */
export function parseSize(text: string): [number, number] | null {
  const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/* ── planning ─────────────────────────────────────────────────────────────── */

function need(bindings: Binding[], id: string): Binding {
  const b = bindings.find((x) => x.id === id);
  if (!b) throw new ScriptError(`This workflow has no parameter "${id}". Pick another one.`);
  return b;
}

const prompts = (bindings: Binding[]) => bindings.filter((b) => b.type === "prompt");

function shortName(model: string): string {
  return (model.replace(/\\/g, "/").split("/").pop() ?? model).replace(/\.[a-z0-9]+$/i, "");
}

function formatValue(b: Binding, v: unknown): string {
  if (b.type === "model") return shortName(String(v));
  if (b.type === "bool") return v ? "on" : "off";
  return String(v);
}

/** Join prompt parts with ", ", without doubling the commas they already end with. */
function joinText(...parts: string[]): string {
  return parts
    .map((p) =>
      p
        .trim()
        .replace(/^,+|,+$/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join(", ");
}

/** Replace `search` in every prompt that has it; the ids it changed. */
function replaceInPrompts(
  bindings: Binding[],
  vals: Record<string, unknown>,
  search: string,
  by: string,
): string[] {
  const changed: string[] = [];
  for (const b of prompts(bindings)) {
    const text = String(vals[b.id] ?? "");
    if (!text.includes(search)) continue;
    vals[b.id] = text.split(search).join(by);
    changed.push(b.id);
  }
  return changed;
}

function inPrompts(bindings: Binding[], values: Record<string, unknown>, search: string): void {
  if (!prompts(bindings).some((b) => String(values[b.id] ?? "").includes(search)))
    throw new ScriptError(`"${search}" isn't in the prompts. Pick text the prompt has.`);
}

interface AxisCell {
  /** The value alone ("20") and with its type ("Steps: 20"). */
  value: string;
  label: string;
  /** Sets the cell's values; returns the ids it set. */
  apply: (values: Record<string, unknown>) => string[];
}

interface Axis {
  name: string;
  /** Two axes with the same key change the same thing. */
  key: string;
  cells: AxisCell[];
}

function axisCells(axis: AxisSpec, bindings: Binding[], values: Record<string, unknown>): Axis {
  if (axis.type === "replace") {
    const search = axis.values[0] as string;
    inPrompts(bindings, values, search);
    return {
      name: "Prompt S/R",
      key: "replace",
      cells: axis.values.map((v) => ({
        value: v,
        label: `Prompt S/R: ${v}`,
        apply: (vals) => replaceInPrompts(bindings, vals, search, v),
      })),
    };
  }
  if (axis.type === "resolution") {
    const w = bindings.find((b) => b.role === "latent.width");
    const h = bindings.find((b) => b.role === "latent.height");
    if (!w || !h) throw new ScriptError("This workflow has no width and height to change.");
    return {
      name: "Resolution",
      key: "resolution",
      cells: axis.values.map((v) => {
        const [width, height] = parseSize(v) ?? [0, 0];
        return {
          value: `${width}×${height}`,
          label: `Resolution: ${width}×${height}`,
          apply: (vals) => {
            vals[w.id] = width;
            vals[h.id] = height;
            return [w.id, h.id];
          },
        };
      }),
    };
  }
  if (axis.type === "lora") {
    return {
      name: "LoRA",
      key: "lora",
      cells: axis.values.map((l) => ({
        value: shortName(l.name),
        label: `LoRA: ${shortName(l.name)}`,
        apply: (vals) => {
          // Joins the instant LoRAs; the same LoRA already there takes this strength.
          const key = l.name.toLowerCase();
          const own = readInstantLoras(vals[INSTANT_LORAS]).filter(
            (x) => x.name.toLowerCase() !== key,
          );
          vals[INSTANT_LORAS] = [...own, l];
          return [INSTANT_LORAS];
        },
      })),
    };
  }
  const b = need(bindings, axis.binding);
  if (!axisBindings(bindings).includes(b))
    throw new ScriptError(`${b.label} can't be an axis. Use Prompt S/R for prompts.`);
  return {
    name: b.label,
    key: b.id,
    cells: axis.values.map((v) => ({
      value: formatValue(b, v),
      label: `${b.label}: ${formatValue(b, v)}`,
      apply: (vals) => {
        vals[b.id] = b.type === "bool" ? Boolean(v) : v;
        return [b.id];
      },
    })),
  };
}

function checkCount(n: number): void {
  if (n > MAX_SCRIPT_RUNS)
    throw new ScriptError(
      `That's ${n} images; a script can queue ${MAX_SCRIPT_RUNS} at most. Use fewer values.`,
    );
  if (n === 0) throw new ScriptError("The script has nothing to run.");
}

function planMatrix(
  script: z.infer<typeof MatrixScript>,
  bindings: Binding[],
  values: Record<string, unknown>,
): ScriptPlan {
  const lines = script.lines;
  const search = script.search.trim();
  let target: Binding | null = null;
  if (script.insert === "replace") {
    if (!search) throw new ScriptError("Pick the text each line replaces.");
    inPrompts(bindings, values, search);
  } else {
    target = need(bindings, script.binding);
    if (target.type !== "prompt")
      throw new ScriptError(`Lines go into a prompt; ${target.label} isn't one.`);
  }
  const repeats = script.useBatch ? script.count : 1;
  checkCount(lines.length * repeats);
  // Without "use batch", each line makes one image.
  const batch = script.useBatch ? undefined : bindings.find((b) => b.role === "latent.batch");

  const lineValues = (line: string): Record<string, unknown> => {
    const vals = { ...values };
    let ids: string[];
    if (target) {
      const base = String(vals[target.id] ?? "");
      vals[target.id] = script.insert === "start" ? joinText(line, base) : joinText(base, line);
      ids = [target.id];
    } else ids = replaceInPrompts(bindings, vals, search, line);
    const out: Record<string, unknown> = {};
    for (const id of ids) out[id] = vals[id];
    if (batch) out[batch.id] = 1;
    return out;
  };

  // One row per line when lines repeat; otherwise a near-square grid with each line under it.
  const table = repeats > 1;
  const cols = table ? repeats : Math.ceil(Math.sqrt(lines.length));
  const cells: ScriptCell[] = [];
  lines.forEach((line, i) => {
    const overrides = lineValues(line);
    for (let r = 0; r < repeats; r++)
      cells.push({
        overrides,
        col: table ? r : i % cols,
        row: table ? i : Math.floor(i / cols),
        label: line,
        ...(r ? { repeat: r } : {}),
      });
  });
  return {
    kind: "matrix",
    cells,
    cols,
    rows: table ? lines.length : Math.ceil(lines.length / cols),
    colLabels: table ? Array.from({ length: repeats }, (_, i) => `#${i + 1}`) : [],
    rowLabels: table ? lines : [],
    ...(table ? {} : { captions: lines }),
    grid: script.grid,
    legend: true,
    margin: 0,
    keepImages: true,
    randomSeeds: false,
    title: `Prompt matrix · ${lines.length} line${lines.length === 1 ? "" : "s"}`,
  };
}

function planXY(
  script: z.infer<typeof XYScript>,
  bindings: Binding[],
  values: Record<string, unknown>,
): ScriptPlan {
  const xs = script.x ? axisCells(script.x, bindings, values) : null;
  const ys = script.y ? axisCells(script.y, bindings, values) : null;
  if (!xs && !ys) throw new ScriptError("Pick a type for X or Y.");
  // Only LoRAs and Prompt S/R make sense on both axes.
  if (xs && ys && xs.key === ys.key && xs.key !== "lora" && xs.key !== "replace")
    throw new ScriptError(`X and Y are both ${xs.name}. Pick something else for one of them.`);
  const across = xs?.cells ?? [null];
  const down = ys?.cells ?? [null];
  checkCount(across.length * down.length);
  const cells: ScriptCell[] = [];
  down.forEach((cy, row) => {
    across.forEach((cx, col) => {
      const vals = { ...values };
      // Every value an axis sets, even when it's the current value.
      const ids = [...(cy?.apply(vals) ?? []), ...(cx?.apply(vals) ?? [])];
      const overrides: Record<string, unknown> = {};
      for (const id of ids) overrides[id] = vals[id];
      cells.push({
        overrides,
        col,
        row,
        label: [cx?.label, cy?.label].filter(Boolean).join(" · "),
      });
    });
  });
  const labels = (axis: Axis | null) =>
    script.legend && axis ? axis.cells.map((c) => (script.legendType ? c.label : c.value)) : [];
  return {
    kind: "xy",
    cells,
    cols: across.length,
    rows: down.length,
    colLabels: labels(xs),
    rowLabels: labels(ys),
    grid: true,
    legend: script.legend,
    margin: script.margin,
    keepImages: script.keepImages,
    randomSeeds: script.randomSeeds,
    title: `XY plot · ${[xs?.name, ys?.name].filter(Boolean).join(" × ")}`,
  };
}

/** Every run a script makes, in the order they're queued (row by row). */
export function planScript(
  input: ScriptInput | Script,
  bindings: Binding[],
  values: Record<string, unknown>,
): ScriptPlan {
  const script = Script.parse(input);
  if (script.kind === "matrix") return planMatrix(script, bindings, values);
  if (script.kind === "xy") return planXY(script, bindings, values);

  const b = need(bindings, script.binding);
  checkCount(script.models.length);
  if (script.target === "model" && b.type !== "model")
    throw new ScriptError(`${b.label} isn't a model parameter.`);
  if (script.target === "lora" && b.type !== "prompt")
    throw new ScriptError("LoRA thumbnails add the LoRA to a prompt; pick the prompt.");
  const cells = script.models.map(
    (model, i): ScriptCell => ({
      overrides:
        script.target === "model"
          ? { [b.id]: model }
          : {
              [INSTANT_LORAS]: [
                { name: model.replace(/\.[a-z0-9]+$/i, ""), strength: script.loraWeight },
              ],
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
    legend: false,
    margin: 0,
    keepImages: true,
    randomSeeds: false,
    title: `Thumbnails · ${cells.length} model${cells.length === 1 ? "" : "s"}`,
  };
}
