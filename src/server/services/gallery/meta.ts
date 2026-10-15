/**
 * Turns an image's text metadata into the gallery's summary and "use these settings" data.
 * Sources, best first: Blombo's own chunk, ComfyUI's prompt graph, A1111 parameters.
 */
import {
  a1111Summary,
  EMPTY_SUMMARY,
  type ImageSettings,
  type ImageSummary,
  parseA1111,
} from "../../../shared/imageinfo.ts";
import { ApiPrompt } from "../../../shared/workflow/graph.ts";
import { summarizeGraph } from "../workflows/summary.ts";

export interface ParsedMeta {
  summary: ImageSummary;
  settings: ImageSettings;
  /** A ComfyUI graph is embedded (importable as a workflow). */
  hasWorkflow: boolean;
  blombo: { workflow: string | null; name: string | null; seed: number | null } | null;
}

interface BlomboChunk {
  workflow?: unknown;
  name?: unknown;
  seed?: unknown;
  values?: unknown;
  prompts?: unknown;
}

function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** The prompt graph from a chunk, or null when it isn't one. */
export function promptGraph(text: Record<string, string>): ApiPrompt | null {
  const parsed = ApiPrompt.safeParse(parseJson(text.prompt));
  return parsed.success && Object.keys(parsed.data).length ? parsed.data : null;
}

export function parseMeta(text: Record<string, string>): ParsedMeta {
  const graph = promptGraph(text);
  const workflowUi = parseJson(text.workflow);
  const hasWorkflow =
    graph !== null ||
    Boolean(workflowUi && typeof workflowUi === "object" && "nodes" in (workflowUi as object));
  const raw = parseJson(text.blombo) as BlomboChunk | undefined;
  const blombo =
    raw && typeof raw === "object"
      ? {
          workflow: str(raw.workflow),
          name: str(raw.name),
          seed: typeof raw.seed === "number" ? raw.seed : null,
        }
      : null;

  if (graph) {
    const { summary, roles } = summarizeGraph(graph);
    const result: ParsedMeta = {
      summary: { ...EMPTY_SUMMARY, ...summary, source: blombo ? "blombo" : "comfy" },
      settings: { workflowId: null, values: null, roles },
      hasWorkflow,
      blombo,
    };
    if (blombo && raw) {
      const prompts = (raw.prompts ?? {}) as Record<string, unknown>;
      // The final texts (wildcards expanded) read better than the graph's, which match anyway.
      const positive = str(prompts["prompt.positive"]);
      const negative = str(prompts["prompt.negative"]);
      if (positive) result.summary.prompt = positive;
      if (negative) result.summary.negative = negative;
      if (blombo.seed !== null) result.summary.seed = blombo.seed;
      result.summary.workflow = blombo.name;
      result.summary.workflowId = blombo.workflow;
      const values =
        raw.values && typeof raw.values === "object" ? { ...(raw.values as object) } : null;
      result.settings = {
        workflowId: blombo.workflow,
        values: values as Record<string, unknown> | null,
        roles,
      };
    }
    return result;
  }

  const params = text.parameters ? parseA1111(text.parameters) : null;
  if (params) {
    const { summary, roles } = a1111Summary(params);
    return { summary, settings: { workflowId: null, values: null, roles }, hasWorkflow, blombo };
  }
  return {
    summary: { ...EMPTY_SUMMARY },
    settings: { workflowId: null, values: null, roles: {} },
    hasWorkflow,
    blombo,
  };
}
