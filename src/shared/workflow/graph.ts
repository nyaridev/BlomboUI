/**
 * ComfyUI graph formats, as loosely as they need to be. ComfyUI and custom nodes add fields
 * freely, so these schemas check only what Blombo reads and keep everything else untouched.
 *
 *  - API format (prompt.json): { "<node id>": { class_type, inputs, _meta: { title } } }.
 *    A linked input is a [sourceNodeId, outputIndex] pair.
 *  - UI format (graph.json): LiteGraph's { nodes[], links[] } canvas serialization.
 *  - object_info: ComfyUI's node definitions (input types, ranges, choices).
 */
import { z } from "zod";

export const ApiNode = z.looseObject({
  class_type: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  _meta: z.looseObject({ title: z.string().optional() }).optional(),
});
export type ApiNode = z.infer<typeof ApiNode>;

export const ApiPrompt = z.record(z.string(), ApiNode);
export type ApiPrompt = z.infer<typeof ApiPrompt>;

/** A linked input in API format: [source node id, output slot]. */
export type ApiLink = [string, number];

export function isApiLink(value: unknown): value is ApiLink {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") &&
    typeof value[1] === "number"
  );
}

export const UiNodeInput = z.looseObject({
  name: z.string(),
  type: z.unknown().optional(),
  link: z.number().nullable().optional(),
  widget: z.looseObject({ name: z.string() }).optional(),
});

export const UiNode = z.looseObject({
  id: z.union([z.number(), z.string()]),
  type: z.string(),
  title: z.string().optional(),
  /** 0 always, 2 never (muted), 4 bypass. */
  mode: z.number().optional(),
  inputs: z.array(UiNodeInput).optional(),
  outputs: z
    .array(z.looseObject({ name: z.string().optional(), links: z.array(z.number()).nullish() }))
    .optional(),
  widgets_values: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
});
export type UiNode = z.infer<typeof UiNode>;

/** [link id, from node, from slot, to node, to slot, type] or the object form newer saves use. */
export const UiLink = z.union([
  z
    .tuple([
      z.number(),
      z.union([z.number(), z.string()]),
      z.number(),
      z.union([z.number(), z.string()]),
      z.number(),
    ])
    .rest(z.unknown()),
  z.looseObject({
    id: z.number(),
    origin_id: z.union([z.number(), z.string()]),
    origin_slot: z.number(),
    target_id: z.union([z.number(), z.string()]),
    target_slot: z.number(),
  }),
]);

export const UiGraph = z.looseObject({
  nodes: z.array(UiNode),
  links: z.array(UiLink).default([]),
  definitions: z.looseObject({ subgraphs: z.array(z.unknown()).optional() }).optional(),
});
export type UiGraph = z.infer<typeof UiGraph>;

/** One input definition: [type or choice list, options]. Newer ComfyUI writes ["COMBO", { options }]. */
export const InputSpec = z.tuple([z.unknown()]).rest(z.unknown());
export type InputSpec = z.infer<typeof InputSpec>;

export const NodeDef = z.looseObject({
  input: z
    .looseObject({
      required: z.record(z.string(), InputSpec).optional(),
      optional: z.record(z.string(), InputSpec).optional(),
    })
    .default({}),
  input_order: z
    .looseObject({
      required: z.array(z.string()).optional(),
      optional: z.array(z.string()).optional(),
    })
    .optional(),
  output: z.array(z.unknown()).default([]),
  output_name: z.array(z.string()).optional(),
  display_name: z.string().optional(),
  category: z.string().optional(),
  output_node: z.boolean().optional(),
});
export type NodeDef = z.infer<typeof NodeDef>;

export const ObjectInfo = z.record(z.string(), NodeDef);
export type ObjectInfo = z.infer<typeof ObjectInfo>;

export interface InputInfo {
  name: string;
  /** "INT" | "FLOAT" | "STRING" | "BOOLEAN" | "COMBO" | a link type such as "MODEL". */
  type: string;
  options: string[] | undefined;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
  default: unknown;
  multiline: boolean;
  /** Seeds and similar ints have a "control after generate" widget next to them in the UI. */
  hasControl: boolean;
  required: boolean;
}

const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);

/** Widget inputs carry values; everything else (MODEL, CLIP, IMAGE…) is a link socket. */
export function isWidgetType(type: string): boolean {
  return WIDGET_TYPES.has(type);
}

function readSpec(name: string, spec: InputSpec, required: boolean): InputInfo {
  const [head, raw] = spec;
  const opts = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  let type: string;
  let options: string[] | undefined;
  if (Array.isArray(head)) {
    type = "COMBO";
    options = head.map(String);
  } else {
    type = String(head);
    if (type === "COMBO" && Array.isArray(opts.options)) options = opts.options.map(String);
  }
  return {
    name,
    type,
    options,
    min: num(opts.min),
    max: num(opts.max),
    step: num(opts.step),
    default: opts.default,
    multiline: opts.multiline === true,
    hasControl:
      opts.control_after_generate === true ||
      ((name === "seed" || name === "noise_seed") && type === "INT"),
    required,
  };
}

/** Inputs of a node definition in ComfyUI's declared order (required first). */
export function nodeInputs(def: NodeDef | undefined): InputInfo[] {
  if (!def) return [];
  const out: InputInfo[] = [];
  for (const group of ["required", "optional"] as const) {
    const specs = def.input[group] ?? {};
    const order = def.input_order?.[group] ?? Object.keys(specs);
    for (const name of order) {
      const spec = specs[name];
      if (spec) out.push(readSpec(name, spec, group === "required"));
    }
  }
  return out;
}
