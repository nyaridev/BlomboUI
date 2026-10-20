/**
 * Import (ADR-0003): a dropped file becomes a workflow package.
 *
 *   ComfyUI PNG / WebP  → its embedded "prompt" (API) and "workflow" (UI) graphs
 *   API JSON            → used as is; a UI graph is laid out when object_info is available
 *   UI JSON             → converted to API with object_info (ComfyUI must be running)
 *   .blombo             → a whole package (bundle.ts), values and linked layout included
 *
 * The analyzer then proposes bindings and values; findings tell the user what's missing.
 */
import { ApiPrompt, isApiLink, type ObjectInfo, UiGraph } from "../../../shared/workflow/graph.ts";
import type { Finding, ImportResult } from "../../../shared/workflow/manifest.ts";
import { HttpError } from "../../lib/http.ts";
import { isPng, isWebp, readPngText, readWebpText } from "../../lib/imagemeta.ts";
import type { LayoutService } from "../layouts.ts";
import { analyze } from "./analyze.ts";
import { freeName, isZip, readBundle } from "./bundle.ts";
import { apiToUi, uiToApi } from "./convert.ts";
import type { WorkflowService } from "./store.ts";

export interface ImportInput {
  bytes: Uint8Array;
  filename: string;
  name?: string;
}

type Source = ImportResult["source"];

const NOT_A_WORKFLOW =
  "That file doesn't contain a ComfyUI workflow. Use a workflow .json (API or UI export), a PNG / WebP saved by ComfyUI, or a .blombo file.";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

function looksLikeApi(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const nodes = Object.values(value);
  return (
    nodes.length > 0 &&
    nodes.every(
      (n) =>
        n &&
        typeof n === "object" &&
        typeof (n as { class_type?: unknown }).class_type === "string",
    )
  );
}

function looksLikeUi(value: unknown): boolean {
  return Boolean(
    value && typeof value === "object" && Array.isArray((value as { nodes?: unknown }).nodes),
  );
}

/** Pull the API and UI graphs out of whatever was dropped. */
export function readWorkflowFile(bytes: Uint8Array): { source: Source; api: unknown; ui: unknown } {
  if (isPng(bytes) || isWebp(bytes)) {
    const meta = isPng(bytes) ? readPngText(bytes) : readWebpText(bytes);
    const api = meta.prompt ? parseJson(meta.prompt) : undefined;
    const ui = meta.workflow ? parseJson(meta.workflow) : undefined;
    if (!looksLikeApi(api) && !looksLikeUi(ui))
      throw new HttpError(
        400,
        "This image has no ComfyUI workflow in it. Only images saved by ComfyUI (with metadata) can be imported.",
        "no_workflow",
      );
    return { source: isPng(bytes) ? "png" : "webp", api: looksLikeApi(api) ? api : undefined, ui };
  }
  const json = parseJson(new TextDecoder("utf-8").decode(bytes));
  if (looksLikeApi(json)) return { source: "api", api: json, ui: undefined };
  const wrapped = json as { prompt?: unknown; workflow?: unknown } | undefined;
  if (wrapped && looksLikeApi(wrapped.prompt))
    return { source: "api", api: wrapped.prompt, ui: wrapped.workflow };
  if (looksLikeUi(json)) return { source: "ui", api: undefined, ui: json };
  throw new HttpError(400, NOT_A_WORKFLOW, "not_a_workflow");
}

function nameFrom(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const stem = base
    .replace(/\.(json|png|webp|blombo)$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
  return (stem || "Imported workflow").slice(0, 80);
}

/** Strip links to nodes that aren't in the graph (left over from deleted or muted nodes). */
function dropDanglingLinks(prompt: ApiPrompt, findings: Finding[]): void {
  for (const [id, node] of Object.entries(prompt))
    for (const [name, v] of Object.entries(node.inputs))
      if (isApiLink(v) && !prompt[String(v[0])]) {
        delete node.inputs[name];
        findings.push({
          level: "warning",
          code: "dangling_link",
          node: id,
          message: `Input "${name}" of node ${id} pointed at a node that isn't in the graph.`,
        });
      }
}

/**
 * A .blombo bundle becomes a new workflow with everything it carried: values, stages, run
 * settings, the linked layout and the thumbnail. A name that's taken gets " copy".
 */
async function importBundle(
  input: ImportInput,
  workflows: WorkflowService,
  objectInfo: ObjectInfo | null,
  layouts: Pick<LayoutService, "adopt"> | null,
): Promise<ImportResult> {
  const parts = readBundle(input.bytes);
  const { format: _f, id: _id, createdAt: _c, updatedAt: _u, ...manifest } = parts.manifest;
  const taken = (await workflows.list()).map((w) => w.name);
  const name = freeName(input.name?.trim() || manifest.name, taken);
  // Only the findings: the bundle's own bindings and values are what the user had.
  const findings = analyze(parts.prompt, objectInfo).findings.filter(
    (f) => f.code === "missing_node" || f.code === "missing_model",
  );
  let layout = manifest.layout;
  // A link without its layout still works for built-ins; anything else falls back to the default.
  if (parts.layout && layouts) layout = await layouts.adopt(parts.layout);
  const workflow = await workflows.create({
    ...manifest,
    name,
    layout,
    prompt: parts.prompt,
    graph: parts.graph,
    thumb: parts.thumb,
  });
  if (name !== manifest.name)
    findings.unshift({
      level: "info",
      code: "renamed",
      message: `A workflow named "${manifest.name}" is already here, so this one is "${name}".`,
    });
  return { workflow, source: "blombo", findings };
}

export async function importWorkflow(
  input: ImportInput,
  workflows: WorkflowService,
  objectInfo: ObjectInfo | null,
  layouts: Pick<LayoutService, "adopt"> | null = null,
): Promise<ImportResult> {
  if (isZip(input.bytes)) return importBundle(input, workflows, objectInfo, layouts);
  const read = readWorkflowFile(input.bytes);
  const findings: Finding[] = [];
  const ui = read.ui !== undefined && UiGraph.safeParse(read.ui).success ? read.ui : null;

  let prompt: ApiPrompt;
  if (read.api !== undefined) {
    const parsed = ApiPrompt.safeParse(read.api);
    if (!parsed.success) throw new HttpError(400, NOT_A_WORKFLOW, "not_a_workflow");
    prompt = parsed.data;
  } else {
    if (!ui) throw new HttpError(400, NOT_A_WORKFLOW, "not_a_workflow");
    if (!objectInfo)
      throw new HttpError(
        409,
        "ComfyUI needs to be running to import a UI-format workflow (it knows each node's inputs). Start ComfyUI, or export the workflow with Export (API) and import that.",
        "comfy_needed",
      );
    const converted = uiToApi(UiGraph.parse(ui), objectInfo);
    prompt = converted.prompt;
    findings.push(...converted.findings);
  }
  if (Object.keys(prompt).length === 0) throw new HttpError(400, NOT_A_WORKFLOW, "not_a_workflow");
  dropDanglingLinks(prompt, findings);

  const analysis = analyze(prompt, objectInfo);
  findings.push(...analysis.findings);
  const graph = ui ?? (objectInfo ? apiToUi(prompt, objectInfo) : null);
  if (!graph)
    findings.push({
      level: "info",
      code: "no_ui_graph",
      message:
        "Saved without a canvas layout because ComfyUI wasn't running. It still runs; import again while ComfyUI runs to get one.",
    });

  const workflow = await workflows.create({
    name: input.name?.trim() || nameFrom(input.filename),
    kind: analysis.kind,
    family: "Imported",
    tags: ["imported"],
    parentId: null,
    preset: null,
    bindings: analysis.bindings,
    values: analysis.values,
    run: { seedMode: "random", count: 1 },
    stages: {},
    layout: null,
    prompt,
    graph,
  });
  return { workflow, source: read.source, findings };
}
