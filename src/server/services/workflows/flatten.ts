/**
 * A UI-format graph with its subgraphs flattened into one, the way ComfyUI's frontend runs
 * them: a node inside subgraph instance 57 is "57:27", inside a nested one "57:80:27", so the
 * ids match what Save to Blombo (`app.graphToPrompt()`) sends back and re-sync keeps values.
 *
 * Links into a subgraph go through its input node (-10): the instance's input of the same name
 * when linked, else the value the instance keeps for it (older saves: one per widget input), else
 * the inner widget's own value (newer saves list `proxyWidgets` and keep the values inside).
 * Links out go through its output node (-20). Muted and bypassed instances stay plain nodes, so
 * they resolve like any muted or bypassed node, and nothing inside them runs.
 *
 * Instances of one subgraph share its definition, as they do in ComfyUI: an inner value is the
 * same for every instance unless the instance keeps its own.
 */
import {
  isWidgetType,
  type UiGraph,
  type UiNode,
  UiSubgraph,
} from "../../../shared/workflow/graph.ts";
import type { Finding } from "../../../shared/workflow/manifest.ts";
import { PRIMITIVE_NODE, REROUTE } from "./nodes.ts";

const SUBGRAPH_INPUT = -10;
const SUBGRAPH_OUTPUT = -20;
const MAX_DEPTH = 16;

/** Where an input's value comes from, through reroutes, bypassed nodes and subgraph edges. */
export type Source =
  | { kind: "output"; node: string; slot: number }
  /** A frontend PrimitiveNode: the value is its widgets_values[0]. */
  | { kind: "primitive"; node: UiNode }
  /** A value kept on a subgraph instance: its widgets_values[index]. */
  | { kind: "instance"; node: UiNode; index: number }
  /** An unlinked subgraph input with no value of its own: the inner widget's value runs. */
  | { kind: "open" }
  | { kind: "none" };

export interface FlatGraph {
  /** Every node that isn't a live subgraph instance, by flattened id, in canvas order. */
  nodes: Map<string, { node: UiNode; prefix: string }>;
  /** Source of a link: pass the node's prefix + its input's link id. */
  trace(key: string): Source;
  findings: Finding[];
}

type Entry =
  | { kind: "node"; node: UiNode; prefix: string }
  | {
      kind: "in";
      instance: UiNode;
      prefix: string;
      def: UiSubgraph;
      valueAt: Array<number | undefined>;
    }
  | { kind: "out"; links: Array<string | undefined> };

const NONE: Source = { kind: "none" };
const OPEN: Source = { kind: "open" };

/**
 * Which of the instance's widgets_values belongs to each subgraph input. Older saves keep one
 * per widget-type input, except inputs the instance shows as plain sockets; anything else is a
 * layout this doesn't know, so the inner values run.
 */
function instanceValueSlots(node: UiNode, def: UiSubgraph): Array<number | undefined> {
  const wv = node.widgets_values;
  const props = (node as { properties?: { proxyWidgets?: unknown } }).properties;
  if (!Array.isArray(wv) || wv.length === 0 || props?.proxyWidgets) return [];
  const sockets = new Set((node.inputs ?? []).filter((i) => !i.widget).map((i) => i.name));
  const own = (def.inputs ?? []).map(
    (i) => typeof i.type === "string" && isWidgetType(i.type) && !sockets.has(i.name),
  );
  if (own.filter(Boolean).length !== wv.length) return [];
  let n = 0;
  return own.map((o) => (o ? n++ : undefined));
}

/** Validated subgraph definitions by id, nested definitions included. The raw objects are kept. */
function definitions(list: unknown[] | undefined, into = new Map<string, UiSubgraph>()) {
  for (const raw of list ?? []) {
    if (!UiSubgraph.safeParse(raw).success) continue;
    const def = raw as UiSubgraph;
    if (into.has(def.id)) continue;
    into.set(def.id, def);
    definitions(def.definitions?.subgraphs, into);
  }
  return into;
}

export function flatten(graph: Pick<UiGraph, "nodes" | "links" | "definitions">): FlatGraph {
  const findings: Finding[] = [];
  const defs = definitions(graph.definitions?.subgraphs);
  const entries = new Map<string, Entry>();
  const links = new Map<string, { from: string; fromSlot: number }>();
  const nodes = new Map<string, { node: UiNode; prefix: string }>();

  const walk = (
    scope: { nodes?: UiNode[]; links?: UiGraph["links"] },
    prefix: string,
    out: Array<string | undefined> | null,
    stack: string[],
  ) => {
    for (const l of scope.links ?? []) {
      const [id, from, fromSlot, to, toSlot] = Array.isArray(l)
        ? [l[0], l[1], l[2], l[3], l[4]]
        : [l.id, l.origin_id, l.origin_slot, l.target_id, l.target_slot];
      links.set(`${prefix}${id}`, { from: `${prefix}${from}`, fromSlot });
      if (out && Number(to) === SUBGRAPH_OUTPUT) out[toSlot] = `${prefix}${id}`;
    }
    for (const node of scope.nodes ?? []) {
      const id = `${prefix}${node.id}`;
      const def = defs.get(node.type);
      if (!def || node.mode === 2 || node.mode === 4) {
        entries.set(id, { kind: "node", node, prefix });
        if (!def) nodes.set(id, { node, prefix });
        continue;
      }
      const outLinks: Array<string | undefined> = [];
      entries.set(id, { kind: "out", links: outLinks });
      if (stack.includes(def.id) || stack.length >= MAX_DEPTH) {
        findings.push({
          level: "error",
          code: "subgraph",
          node: id,
          message: `"${node.title ?? def.name ?? "Subgraph"}" contains itself, so it can't be converted. Fix the subgraph in ComfyUI, or use Export (API) and import that file instead.`,
        });
        continue;
      }
      // Inner links from the subgraph's input node come from "<instance>:-10".
      entries.set(`${id}:${SUBGRAPH_INPUT}`, {
        kind: "in",
        instance: node,
        prefix,
        def,
        valueAt: instanceValueSlots(node, def),
      });
      walk(def, `${id}:`, outLinks, [...stack, def.id]);
    }
  };
  walk(graph, "", null, []);

  const trace = (key: string, depth = 0): Source => {
    const l = links.get(key);
    const src = l ? entries.get(l.from) : undefined;
    if (!l || !src || depth > 64) return NONE;
    if (src.kind === "out") {
      const next = src.links[l.fromSlot];
      return next === undefined ? NONE : trace(next, depth + 1);
    }
    if (src.kind === "in") {
      const name = src.def.inputs?.[l.fromSlot]?.name;
      const slot = src.instance.inputs?.find((i) => i.name === name);
      if (slot?.link !== null && slot?.link !== undefined)
        return trace(`${src.prefix}${slot.link}`, depth + 1);
      const index = src.valueAt[l.fromSlot];
      return index === undefined ? OPEN : { kind: "instance", node: src.instance, index };
    }
    const { node, prefix } = src;
    if (node.type === REROUTE) {
      const next = node.inputs?.[0]?.link;
      return next === null || next === undefined ? NONE : trace(`${prefix}${next}`, depth + 1);
    }
    if (node.type === PRIMITIVE_NODE) return { kind: "primitive", node };
    if (node.mode === 2) return NONE;
    if (node.mode === 4) {
      // Bypassed: pass through the first linked input of the same type as this output.
      const outType = (node.outputs?.[l.fromSlot] as { type?: unknown } | undefined)?.type;
      const through = node.inputs?.find(
        (i) => i.link !== null && i.link !== undefined && i.type === outType,
      );
      return through?.link === null || through?.link === undefined
        ? NONE
        : trace(`${prefix}${through.link}`, depth + 1);
    }
    return { kind: "output", node: l.from, slot: l.fromSlot };
  };

  return { nodes, trace, findings };
}
