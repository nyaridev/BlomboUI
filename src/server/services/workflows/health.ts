/**
 * The workflow check (ADR-0018): what a workflow needs that this ComfyUI doesn't have, and where
 * to get it. Pure: the service in `routes/workflows.ts` hands it the graphs, object_info and the
 * lists it reads from.
 *
 *   custom nodes   classes object_info doesn't know (in the API graph, and on the canvas, where
 *                  a UI import keeps nodes the converter had to leave out). Each one's pack is,
 *                  in order: one Blombo's own packages pin; the repository and commit ComfyUI
 *                  saved on the node (`properties.aux_id`, `properties.ver`); ComfyUI-Manager's
 *                  node map. Classes none of them know are listed so the user can name the repo.
 *   models         inputs whose value isn't among ComfyUI's choices for them, when the input is a
 *                  model input or the value is a model file. A download is offered when the same
 *                  file is in ComfyUI-Manager's catalog, or the workflow links it
 *                  (`properties.models`, Hugging Face only).
 *   rebuild        the canvas has nodes the API graph lacks (left out at import) and ComfyUI
 *                  knows them now: Rebuild converts the canvas again.
 */
import type { ModelKind } from "../../../shared/constants.ts";
import { kindOfFolder } from "../../../shared/manager.ts";
import { type ApiPrompt, nodeInputs, type ObjectInfo } from "../../../shared/workflow/graph.ts";
import type { MissingModel, MissingPack, WorkflowHealth } from "../../../shared/workflow/health.ts";
import type { NodePack } from "../../../shared/workflow/packs.ts";
import { type NodeMapEntry, packFor } from "../nodemap.ts";
import { FRONTEND_ONLY_CLASSES, MODEL_INPUTS } from "./nodes.ts";

const MODEL_FILE = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf|onnx)$/i;

export interface CatalogFile {
  id: string;
  filename: string;
  kind: ModelKind | null;
  size: number | null;
  host: string;
}

export interface HealthInput {
  prompt: ApiPrompt;
  /** The canvas (UI graph), when the workflow has one. */
  graph: unknown;
  info: ObjectInfo | null;
  /** Packs Blombo's stages and presets pin. */
  known: NodePack[];
  nodeMap: NodeMapEntry[];
  catalog: CatalogFile[];
  /** Hosts a workflow's model links may point at. */
  linkAllowed: (url: URL) => boolean;
}

interface CanvasNode {
  id: string;
  type: string;
  mode: number;
  properties: Record<string, unknown>;
  top: boolean;
}

/** The canvas's nodes, subgraphs' insides included (only the top level for `top`). */
function canvasNodes(graph: unknown): { nodes: CanvasNode[]; subgraphs: Set<string> } {
  const g = graph as {
    nodes?: unknown[];
    definitions?: { subgraphs?: { id?: unknown; nodes?: unknown[] }[] };
  } | null;
  const subs = Array.isArray(g?.definitions?.subgraphs) ? g.definitions.subgraphs : [];
  const subgraphs = new Set(subs.flatMap((s) => (typeof s?.id === "string" ? [s.id] : [])));
  const read = (list: unknown, top: boolean): CanvasNode[] =>
    (Array.isArray(list) ? list : []).flatMap((raw) => {
      const n = raw as { id?: unknown; type?: unknown; mode?: unknown; properties?: unknown };
      if (typeof n?.type !== "string") return [];
      return [
        {
          id: String(n.id),
          type: n.type,
          mode: typeof n.mode === "number" ? n.mode : 0,
          properties:
            n.properties && typeof n.properties === "object"
              ? (n.properties as Record<string, unknown>)
              : {},
          top,
        },
      ];
    });
  return {
    nodes: [...read(g?.nodes, true), ...subs.flatMap((s) => read(s?.nodes, false))],
    subgraphs,
  };
}

/** Muted (2) and bypassed (4) nodes don't run, so they need nothing. */
const runs = (n: CanvasNode) => n.mode !== 2 && n.mode !== 4;

const basename = (file: string) => file.replace(/\\/g, "/").split("/").pop() ?? file;
const sameFile = (a: string, b: string) => basename(a).toLowerCase() === basename(b).toLowerCase();

/** The pack ComfyUI saved on a node: "owner/repo" and the commit, when it's one. */
function savedPack(n: CanvasNode): { url: string; ref?: string } | null {
  const aux = n.properties.aux_id;
  if (typeof aux !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(aux)) return null;
  const ver = n.properties.ver;
  const url = `https://github.com/${aux.replace(/\.git$/i, "")}`;
  return typeof ver === "string" && /^[0-9a-f]{40}$/.test(ver) ? { url, ref: ver } : { url };
}

function missingPacks(
  input: HealthInput,
  canvas: CanvasNode[],
  subgraphs: Set<string>,
): { packs: MissingPack[]; unknownNodes: string[] } {
  const info = input.info ?? {};
  const classes = new Set(Object.values(input.prompt).map((n) => n.class_type));
  for (const n of canvas) if (runs(n) && !subgraphs.has(n.type)) classes.add(n.type);
  const missing = [...classes].filter((c) => !info[c] && !FRONTEND_ONLY_CLASSES.has(c)).sort();

  const packs = new Map<string, MissingPack>();
  const unknownNodes: string[] = [];
  const add = (pack: Omit<MissingPack, "nodes">, cls: string) => {
    const had = packs.get(pack.url);
    if (had) had.nodes.push(cls);
    else packs.set(pack.url, { ...pack, nodes: [cls] });
  };
  for (const cls of missing) {
    const pinned = input.known.find((p) => p.ref && p.nodes.includes(cls));
    if (pinned) {
      add({ ...pinned, source: "blombo" }, cls);
      continue;
    }
    const saved = canvas.filter((n) => n.type === cls).flatMap((n) => savedPack(n) ?? [])[0];
    if (saved) {
      add({ name: saved.url.split("/").pop() ?? saved.url, ...saved, source: "workflow" }, cls);
      continue;
    }
    const mapped = packFor(input.nodeMap, cls);
    if (mapped) add({ name: mapped.name, url: mapped.url, source: "manager" }, cls);
    else unknownNodes.push(cls);
  }
  return { packs: [...packs.values()], unknownNodes };
}

/** What the workflow links for a file: `properties.models` on its nodes. */
function linkFor(
  input: HealthInput,
  canvas: CanvasNode[],
  file: string,
): { url: string; host: string; kind: ModelKind | null } | null {
  for (const n of canvas) {
    const models = n.properties.models;
    if (!Array.isArray(models)) continue;
    for (const m of models as { name?: unknown; url?: unknown; directory?: unknown }[]) {
      if (typeof m?.name !== "string" || typeof m.url !== "string" || !sameFile(m.name, file))
        continue;
      let url: URL;
      try {
        url = new URL(m.url);
      } catch {
        continue;
      }
      if (!input.linkAllowed(url) || !sameFile(decodeURIComponent(url.pathname), file)) continue;
      const kind = typeof m.directory === "string" ? kindOfFolder(m.directory) : null;
      return { url: url.href, host: url.host, kind };
    }
  }
  return null;
}

function missingModels(input: HealthInput, canvas: CanvasNode[]): MissingModel[] {
  if (!input.info) return [];
  const found = new Map<string, MissingModel>();
  for (const [id, node] of Object.entries(input.prompt)) {
    const def = input.info[node.class_type];
    if (!def) continue;
    for (const spec of nodeInputs(def)) {
      const value = node.inputs[spec.name];
      if (typeof value !== "string" || !value || !spec.options) continue;
      const kind = MODEL_INPUTS[spec.name] ?? null;
      if (!kind && !MODEL_FILE.test(value)) continue;
      const norm = (s: string) => s.replace(/\\/g, "/");
      if (spec.options.some((o) => norm(o) === norm(value))) continue;
      const had = found.get(value);
      if (had) {
        had.nodes.push(`${id} · ${spec.name}`);
        continue;
      }
      found.set(value, { file: value, kind, nodes: [`${id} · ${spec.name}`], download: null });
    }
  }
  for (const m of found.values()) {
    const entry = input.catalog.find((e) => e.kind && sameFile(e.filename, m.file));
    const link = linkFor(input, canvas, m.file);
    m.kind ??= entry?.kind ?? link?.kind ?? null;
    if (entry)
      m.download = { source: "manager", entryId: entry.id, size: entry.size, host: entry.host };
    else if (link && m.kind) m.download = { source: "url", url: link.url, host: link.host };
  }
  return [...found.values()];
}

/** Nodes on the canvas that the API graph lacks and ComfyUI knows now (see the top). */
function needsRebuild(input: HealthInput, canvas: CanvasNode[], subgraphs: Set<string>): boolean {
  if (!input.info || subgraphs.size) return false;
  const top = canvas.filter((n) => n.top);
  const ids = new Set(top.map((n) => n.id));
  // Only when the two graphs share node ids (a UI import), so ids can be compared at all.
  if (!Object.keys(input.prompt).every((id) => ids.has(id))) return false;
  const info = input.info;
  return top.some(
    (n) => runs(n) && !FRONTEND_ONLY_CLASSES.has(n.type) && !input.prompt[n.id] && info[n.type],
  );
}

export function checkHealth(input: HealthInput): WorkflowHealth {
  if (!input.info)
    return { checked: false, packs: [], unknownNodes: [], models: [], rebuild: false };
  const { nodes, subgraphs } = canvasNodes(input.graph);
  return {
    checked: true,
    ...missingPacks(input, nodes, subgraphs),
    models: missingModels(input, nodes),
    rebuild: needsRebuild(input, nodes, subgraphs),
  };
}
