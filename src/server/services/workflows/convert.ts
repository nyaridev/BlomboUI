/**
 * Converting between ComfyUI's two graph formats with object_info as the dictionary.
 *
 *  - uiToApi: a UI-format graph (what "Save" writes) into the API format Blombo runs. Widget
 *    values are matched to inputs by their declared order; reroutes, primitives and bypassed
 *    nodes are resolved, and subgraphs are flattened the way ComfyUI's frontend runs them
 *    (`flatten.ts`: inner nodes get ids like "57:27", values set on an instance win). Unknown
 *    custom nodes are reported as findings (exporting in API format from ComfyUI always works).
 *  - apiToUi: a simple left-to-right canvas for an API graph, so it can be opened in ComfyUI.
 */
import {
  type ApiPrompt,
  type InputInfo,
  isApiLink,
  isWidgetType,
  nodeInputs,
  type ObjectInfo,
  type UiGraph,
  type UiNode,
} from "../../../shared/workflow/graph.ts";
import type { Finding } from "../../../shared/workflow/manifest.ts";
import { flatten } from "./flatten.ts";
import { FRONTEND_ONLY_CLASSES, LORA_STACK_CLASSES, UPLOAD_WIDGET_FLAGS } from "./nodes.ts";

function hasUploadWidget(info: ObjectInfo, cls: string, input: string): boolean {
  const def = info[cls];
  const spec = def?.input.required?.[input] ?? def?.input.optional?.[input];
  const opts = spec?.[1];
  return Boolean(opts && typeof opts === "object" && UPLOAD_WIDGET_FLAGS.some((f) => f in opts));
}

interface Placed {
  inp: InputInfo;
  /** "<combo>.<input>" for what a dynamic combo adds. */
  name: string;
  /** Index in widgets_values, or undefined for a socket. */
  at: number | undefined;
  upload: boolean;
}

/**
 * A node's inputs with the widgets_values index of each widget, the way ComfyUI's frontend
 * lays them out: a seed's "control after generate" and an upload button take a slot each,
 * socket-only inputs none, and a dynamic combo's picked choice (`keyOf`) adds its inputs
 * right after it.
 */
function layout(
  info: ObjectInfo,
  cls: string,
  keyOf: (name: string, at: number) => unknown,
): Placed[] {
  const out: Placed[] = [];
  let idx = 0;
  const visit = (inputs: InputInfo[], prefix: string) => {
    for (const inp of inputs) {
      const name = prefix + inp.name;
      if (inp.forceInput || !(isWidgetType(inp.type) || inp.choices)) {
        out.push({ inp, name, at: undefined, upload: false });
        continue;
      }
      const at = idx++;
      const upload = !prefix && hasUploadWidget(info, cls, inp.name);
      if (inp.hasControl) idx++;
      if (upload) idx++;
      out.push({ inp, name, at, upload });
      if (inp.choices) {
        const key = keyOf(name, at) ?? inp.default ?? inp.options?.[0];
        visit(inp.choices[String(key)] ?? [], `${name}.`);
      }
    }
  };
  visit(nodeInputs(info[cls]), "");
  return out;
}

/** A widget's saved value: by index in the array form, by name in the object form. */
function savedValue(node: UiNode, name: string, at: number): unknown {
  const wv = node.widgets_values;
  if (Array.isArray(wv)) return wv[at];
  return wv && typeof wv === "object" ? (wv as Record<string, unknown>)[name] : undefined;
}

export function uiToApi(
  graph: UiGraph,
  info: ObjectInfo,
): { prompt: ApiPrompt; findings: Finding[] } {
  const flat = flatten(graph);
  const findings: Finding[] = [...flat.findings];

  /** API value for a link: [node, slot], a literal, or undefined when dropped. */
  const resolve = (key: string): unknown => {
    const src = flat.trace(key);
    if (src.kind === "output") return [src.node, src.slot];
    const wv = src.kind === "primitive" || src.kind === "instance" ? src.node.widgets_values : null;
    if (!Array.isArray(wv)) return undefined;
    return src.kind === "instance" ? wv[src.index] : wv[0];
  };

  const prompt: ApiPrompt = {};
  const missing = new Set<string>();
  for (const [id, { node, prefix }] of flat.nodes) {
    if (FRONTEND_ONLY_CLASSES.has(node.type) || node.mode === 2 || node.mode === 4) continue;
    const def = info[node.type];
    if (!def) {
      missing.add(node.type);
      continue;
    }
    const inputs: Record<string, unknown> = {};
    const wv = node.widgets_values;
    for (const { inp, name, at } of layout(info, node.type, (n, i) => savedValue(node, n, i))) {
      const slot = node.inputs?.find((s) => s.name === name || s.widget?.name === name);
      const linked =
        slot?.link !== null && slot?.link !== undefined
          ? resolve(`${prefix}${slot.link}`)
          : undefined;
      if (at !== undefined) {
        // A save older than the node has no value for its newer inputs: ComfyUI fills the default.
        const value = linked ?? savedValue(node, name, at) ?? inp.default ?? inp.options?.[0];
        if (value !== undefined && value !== null) inputs[name] = value;
      } else if (linked !== undefined) {
        inputs[name] = linked;
      }
    }
    if (LORA_STACK_CLASSES.has(node.type) && Array.isArray(wv)) {
      let n = 0;
      for (const v of wv) if (v && typeof v === "object" && "lora" in v) inputs[`lora_${++n}`] = v;
    }
    prompt[id] = {
      class_type: node.type,
      inputs,
      _meta: { title: node.title ?? def.display_name ?? node.type },
    };
  }
  for (const cls of missing)
    findings.push({
      level: "error",
      code: "missing_node",
      message: `Missing custom node "${cls}". Install it with ComfyUI Manager, restart ComfyUI, then import again.`,
    });
  return { prompt, findings };
}

/* ── API → UI ─────────────────────────────────────────────────────────────── */

const COLUMN = 340;
const ROW_GAP = 40;

function slotType(inp: InputInfo): string {
  return inp.type === "COMBO" ? "COMBO" : inp.type;
}

export function apiToUi(prompt: ApiPrompt, info: ObjectInfo): Record<string, unknown> {
  const ids = Object.keys(prompt);
  const numeric = ids.every((id) => /^\d+$/.test(id));
  const uiId = new Map<string, number>(ids.map((id, i) => [id, numeric ? Number(id) : i + 1]));

  // Column = longest chain of links from a source node.
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen = new Set<string>()): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    let d = 0;
    for (const v of Object.values(prompt[id]?.inputs ?? {}))
      if (isApiLink(v) && prompt[String(v[0])]) d = Math.max(d, depthOf(String(v[0]), seen) + 1);
    depth.set(id, d);
    return d;
  };

  const columnY = new Map<number, number>();
  let linkId = 0;
  const links: unknown[] = [];
  const outputsByNode = new Map<
    string,
    Array<{ name: string; type: string; links: number[]; slot_index: number }>
  >();
  const nodes: Array<Record<string, unknown>> = [];

  for (const id of ids) {
    const def = info[prompt[id]?.class_type ?? ""];
    const outs = (def?.output ?? []).map((t, i) => ({
      name: def?.output_name?.[i] ?? (Array.isArray(t) ? "COMBO" : String(t)),
      type: Array.isArray(t) ? "COMBO" : String(t),
      links: [] as number[],
      slot_index: i,
    }));
    outputsByNode.set(id, outs);
  }

  for (const id of ids) {
    const node = prompt[id];
    if (!node) continue;
    const def = info[node.class_type];
    const slots: Array<Record<string, unknown>> = [];
    const widgets: unknown[] = [];
    const placed = layout(info, node.class_type, (name) => node.inputs[name]);
    for (const { inp, name, at, upload } of placed) {
      const v = node.inputs[name];
      const widget = at !== undefined;
      if (isApiLink(v)) {
        const src = String(v[0]);
        const lid = ++linkId;
        slots.push({
          name,
          type: slotType(inp),
          link: lid,
          ...(widget ? { widget: { name } } : {}),
        });
        links.push([
          lid,
          uiId.get(src) ?? 0,
          v[1],
          uiId.get(id) ?? 0,
          slots.length - 1,
          slotType(inp),
        ]);
        outputsByNode.get(src)?.[v[1]]?.links.push(lid);
      } else if (!widget) {
        slots.push({ name, type: slotType(inp), link: null });
      }
      if (widget) {
        widgets.push(isApiLink(v) || v === undefined ? (inp.default ?? null) : v);
        if (inp.hasControl) widgets.push("fixed");
        if (upload) widgets.push("image");
      }
    }
    // Extra inputs object_info doesn't list (LoRA stack entries and the like) stay as values.
    for (const [name, v] of Object.entries(node.inputs))
      if (!placed.some((p) => p.name === name) && v && typeof v === "object" && !isApiLink(v))
        widgets.push(v);

    const col = depthOf(id);
    const height = 46 + 24 * (widgets.length + Math.max(slots.length, def?.output.length ?? 0));
    const y = columnY.get(col) ?? 0;
    columnY.set(col, y + height + ROW_GAP);
    const title = node._meta?.title;
    nodes.push({
      id: uiId.get(id),
      type: node.class_type,
      pos: [col * COLUMN, y],
      size: [300, height],
      flags: {},
      order: col,
      mode: 0,
      inputs: slots,
      outputs: outputsByNode.get(id) ?? [],
      properties: { "Node name for S&R": node.class_type },
      widgets_values: widgets,
      ...(title && title !== (def?.display_name ?? node.class_type) ? { title } : {}),
    });
  }

  return {
    last_node_id: Math.max(0, ...nodes.map((n) => Number(n.id))),
    last_link_id: linkId,
    nodes,
    links,
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
  };
}

/**
 * Write values into a UI graph's widgets, the way uiToApi reads them (same widget order, the
 * extra "control after generate" and upload widgets skipped). Edit in ComfyUI uses it so the
 * canvas shows the workflow's current values, not the ones it was imported with. Nodes go by
 * their flattened ids ("57:27" inside subgraph 57). An input fed by a primitive node (through
 * reroutes) gets the value on that primitive, and one fed by a subgraph input gets it where
 * that input's value is kept (the instance, or the inner widget): that's where uiToApi and
 * ComfyUI read it. Other linked inputs and nodes the graph doesn't have are left alone.
 */
export function applyWidgetValues(
  graph: unknown,
  edits: Array<{ node: string; input: string; value: unknown }>,
  info: ObjectInfo,
): unknown {
  const out = structuredClone(graph) as Partial<UiGraph>;
  const flat = flatten({
    nodes: out.nodes ?? [],
    links: out.links ?? [],
    definitions: out.definitions,
  });
  const byNode = new Map<string, Array<{ input: string; value: unknown }>>();
  for (const e of edits) byNode.set(e.node, [...(byNode.get(e.node) ?? []), e]);
  for (const [id, { node, prefix }] of flat.nodes) {
    const mine = byNode.get(id);
    const def = info[node.type];
    if (!mine || !def) continue;
    const wv = node.widgets_values;
    for (const { name, at } of layout(info, node.type, (n, i) => savedValue(node, n, i))) {
      const edit = mine.find((e) => e.input === name);
      if (at === undefined || !edit || edit.value === undefined) continue;
      const slot = node.inputs?.find((s) => s.name === name || s.widget?.name === name);
      if (slot?.link !== null && slot?.link !== undefined) {
        const src = flat.trace(`${prefix}${slot.link}`);
        const held =
          src.kind === "primitive" || src.kind === "instance" ? src.node.widgets_values : null;
        if (Array.isArray(held) && held.length)
          held[src.kind === "instance" ? src.index : 0] = edit.value;
        if (src.kind !== "open") continue;
      }
      if (Array.isArray(wv)) {
        if (at < wv.length) wv[at] = edit.value;
      } else if (wv && typeof wv === "object") (wv as Record<string, unknown>)[name] = edit.value;
    }
  }
  return out;
}
