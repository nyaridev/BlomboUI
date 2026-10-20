/**
 * Converting between ComfyUI's two graph formats with object_info as the dictionary.
 *
 *  - uiToApi: a UI-format graph (what "Save" writes) into the API format Blombo runs. Widget
 *    values are matched to inputs by their declared order; reroutes, primitives and bypassed
 *    nodes are resolved. Subgraphs and frontend-only plugins can't be converted here; the
 *    findings say so (exporting in API format from ComfyUI always works).
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
import { FRONTEND_ONLY_CLASSES, LORA_STACK_CLASSES, UPLOAD_WIDGET_FLAGS } from "./nodes.ts";

interface LinkRec {
  from: string;
  fromSlot: number;
}

function hasUploadWidget(info: ObjectInfo, cls: string, input: string): boolean {
  const def = info[cls];
  const spec = def?.input.required?.[input] ?? def?.input.optional?.[input];
  const opts = spec?.[1];
  return Boolean(opts && typeof opts === "object" && UPLOAD_WIDGET_FLAGS.some((f) => f in opts));
}

export function uiToApi(
  graph: UiGraph,
  info: ObjectInfo,
): { prompt: ApiPrompt; findings: Finding[] } {
  const findings: Finding[] = [];
  const nodes = new Map<string, UiNode>(graph.nodes.map((n) => [String(n.id), n]));
  const links = new Map<number, LinkRec>();
  for (const l of graph.links) {
    if (Array.isArray(l)) links.set(l[0], { from: String(l[1]), fromSlot: l[2] });
    else links.set(l.id, { from: String(l.origin_id), fromSlot: l.origin_slot });
  }
  const subgraphs = new Set(
    (graph.definitions?.subgraphs ?? [])
      .map((s) => (s && typeof s === "object" ? String((s as { id?: unknown }).id ?? "") : ""))
      .filter(Boolean),
  );

  /** API value for a link: [node, slot], a primitive's literal, or undefined when dropped. */
  const resolve = (linkId: number, depth = 0): unknown => {
    const l = links.get(linkId);
    const src = l ? nodes.get(l.from) : undefined;
    if (!l || !src || depth > 32) return undefined;
    if (src.type === "Reroute") {
      const next = src.inputs?.[0]?.link;
      return next === null || next === undefined ? undefined : resolve(next, depth + 1);
    }
    if (src.type === "PrimitiveNode") {
      return Array.isArray(src.widgets_values) ? src.widgets_values[0] : undefined;
    }
    if (src.mode === 2) return undefined;
    if (src.mode === 4) {
      // Bypassed: pass through the first linked input of the same type as this output.
      const outType = (src.outputs?.[l.fromSlot] as { type?: unknown } | undefined)?.type;
      const through = src.inputs?.find(
        (i) => i.link !== null && i.link !== undefined && i.type === outType,
      );
      return through?.link === null || through?.link === undefined
        ? undefined
        : resolve(through.link, depth + 1);
    }
    return [l.from, l.fromSlot];
  };

  const prompt: ApiPrompt = {};
  const missing = new Set<string>();
  for (const node of graph.nodes) {
    const id = String(node.id);
    if (FRONTEND_ONLY_CLASSES.has(node.type) || node.mode === 2 || node.mode === 4) continue;
    if (subgraphs.has(node.type)) {
      findings.push({
        level: "error",
        code: "subgraph",
        node: id,
        message: `"${node.title ?? "Subgraph"}" is a subgraph, which can't be converted here. In ComfyUI, use Export (API) and import that file instead.`,
      });
      continue;
    }
    const def = info[node.type];
    if (!def) {
      missing.add(node.type);
      continue;
    }
    const inputs: Record<string, unknown> = {};
    const wv = node.widgets_values;
    let idx = 0;
    for (const inp of nodeInputs(def)) {
      const slot = node.inputs?.find((s) => s.name === inp.name || s.widget?.name === inp.name);
      const linked =
        slot?.link !== null && slot?.link !== undefined ? resolve(slot.link) : undefined;
      if (isWidgetType(inp.type)) {
        let value: unknown;
        if (Array.isArray(wv)) {
          value = wv[idx++];
          if (inp.hasControl) idx++;
          if (hasUploadWidget(info, node.type, inp.name)) idx++;
        } else if (wv && typeof wv === "object") {
          value = (wv as Record<string, unknown>)[inp.name];
        }
        if (linked !== undefined) value = linked;
        if (value !== undefined && value !== null) inputs[inp.name] = value;
      } else if (linked !== undefined) {
        inputs[inp.name] = linked;
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
    for (const inp of nodeInputs(def)) {
      const v = node.inputs[inp.name];
      const widget = isWidgetType(inp.type);
      if (isApiLink(v)) {
        const src = String(v[0]);
        const lid = ++linkId;
        slots.push({
          name: inp.name,
          type: slotType(inp),
          link: lid,
          ...(widget ? { widget: { name: inp.name } } : {}),
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
        slots.push({ name: inp.name, type: slotType(inp), link: null });
      }
      if (widget) {
        widgets.push(isApiLink(v) || v === undefined ? (inp.default ?? null) : v);
        if (inp.hasControl) widgets.push("fixed");
        if (hasUploadWidget(info, node.class_type, inp.name)) widgets.push("image");
      }
    }
    // Extra inputs object_info doesn't list (LoRA stack entries and the like) stay as values.
    for (const [name, v] of Object.entries(node.inputs))
      if (
        !nodeInputs(def).some((i) => i.name === name) &&
        v &&
        typeof v === "object" &&
        !isApiLink(v)
      )
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
 * canvas shows the workflow's current values, not the ones it was imported with. An input fed
 * by a primitive node (through reroutes) gets the value on that primitive, which is where
 * uiToApi and ComfyUI read it; other linked inputs and nodes the graph doesn't have are left
 * alone.
 */
export function applyWidgetValues(
  graph: unknown,
  edits: Array<{ node: string; input: string; value: unknown }>,
  info: ObjectInfo,
): unknown {
  const out = structuredClone(graph) as { nodes?: UiNode[]; links?: UiGraph["links"] };
  const nodes = new Map((out.nodes ?? []).map((n) => [String(n.id), n]));
  const origins = new Map<number, string>();
  for (const l of out.links ?? []) {
    if (Array.isArray(l)) origins.set(l[0], String(l[1]));
    else origins.set(l.id, String(l.origin_id));
  }
  /** The primitive node a link comes from (through reroutes), or null. */
  const primitiveOf = (linkId: number): UiNode | null => {
    for (let id: number | null | undefined = linkId, depth = 0; id != null && depth < 32; depth++) {
      const src = nodes.get(origins.get(id) ?? "");
      if (!src) return null;
      if (src.type === "PrimitiveNode") return src;
      if (src.type !== "Reroute") return null;
      id = src.inputs?.[0]?.link;
    }
    return null;
  };
  const byNode = new Map<string, Array<{ input: string; value: unknown }>>();
  for (const e of edits) byNode.set(e.node, [...(byNode.get(e.node) ?? []), e]);
  for (const node of out.nodes ?? []) {
    const mine = byNode.get(String(node.id));
    const def = info[node.type];
    if (!mine || !def) continue;
    const wv = node.widgets_values;
    let idx = 0;
    for (const inp of nodeInputs(def)) {
      if (!isWidgetType(inp.type)) continue;
      const at = idx;
      idx++;
      if (inp.hasControl) idx++;
      if (hasUploadWidget(info, node.type, inp.name)) idx++;
      const edit = mine.find((e) => e.input === inp.name);
      if (!edit || edit.value === undefined) continue;
      const slot = node.inputs?.find((s) => s.name === inp.name || s.widget?.name === inp.name);
      if (slot?.link !== null && slot?.link !== undefined) {
        const primitive = primitiveOf(slot.link);
        if (primitive && Array.isArray(primitive.widgets_values) && primitive.widgets_values.length)
          primitive.widgets_values[0] = edit.value;
        continue;
      }
      if (Array.isArray(wv)) {
        if (at < wv.length) wv[at] = edit.value;
      } else if (wv && typeof wv === "object")
        (wv as Record<string, unknown>)[inp.name] = edit.value;
    }
  }
  return out;
}
