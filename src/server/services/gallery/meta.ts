/**
 * Turns an image's text metadata into the gallery's summary and "use these settings" data.
 * Sources, best first: Blombo's own chunk, ComfyUI's prompt graph, A1111 parameters.
 * Civitai's generator saves its graph with an `extraMetadata` entry beside the nodes: the
 * prompt and settings as Civitai keeps them, which read better than the graph's.
 */
import {
  a1111Summary,
  civitaiSummary,
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** The nodes of a parsed prompt chunk, without other entries (Civitai's extra, extraMetadata). */
function graphOf(value: unknown): ApiPrompt | null {
  if (!isObject(value)) return null;
  const nodes = Object.entries(value).filter(([, v]) => isObject(v) && "class_type" in v);
  const parsed = ApiPrompt.safeParse(Object.fromEntries(nodes));
  return parsed.success && Object.keys(parsed.data).length ? parsed.data : null;
}

/** The prompt graph from a chunk, or null when it isn't one. */
export function promptGraph(text: Record<string, string>): ApiPrompt | null {
  return graphOf(parseJson(text.prompt));
}

/** Civitai's generator's own record in its graph (a JSON string, or an object). */
function civitaiExtra(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const extra =
    typeof value.extraMetadata === "string" ? parseJson(value.extraMetadata) : value.extraMetadata;
  return isObject(extra) ? extra : null;
}

export function parseMeta(text: Record<string, string>): ParsedMeta {
  const chunk = parseJson(text.prompt);
  const graph = graphOf(chunk);
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
    const extra = blombo ? null : civitaiExtra(chunk);
    if (extra) {
      const shared = civitaiSummary(extra);
      const s = result.summary;
      // Civitai's texts win; the graph's settings stay, with Civitai's filling any it lacks.
      result.summary = {
        ...s,
        source: "civitai",
        prompt: shared.summary.prompt ?? s.prompt,
        negative: shared.summary.negative ?? s.negative,
        seed: s.seed ?? shared.summary.seed,
        steps: s.steps ?? shared.summary.steps,
        cfg: s.cfg ?? shared.summary.cfg,
        sampler: s.sampler ?? shared.summary.sampler,
      };
      const texts = Object.fromEntries(
        Object.entries(shared.roles).filter(([k]) => k.startsWith("prompt.")),
      );
      result.settings.roles = { ...shared.roles, ...roles, ...texts };
    }
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
