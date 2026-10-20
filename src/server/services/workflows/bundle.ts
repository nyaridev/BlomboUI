/**
 * .blombo bundles: one workflow as a zip, to move it between profiles or machines.
 *
 *   blombo.json     { format: "blombo.bundle/1", app, version, exportedAt }
 *   workflow.json   the manifest (values, stages, run settings)
 *   prompt.json     the API graph
 *   graph.json      the UI graph (when the package has one)
 *   layout.json     the linked layout, when it's one of the profile's own (built-ins go by id)
 *   thumb.webp      the picker thumbnail (when there is one)
 *
 * Reading checks every part with the shared schemas and refuses anything else in the zip, so a
 * bundle can't carry extra files or oversized entries.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { LayoutDocument } from "../../../shared/layout/schema.ts";
import { ApiPrompt } from "../../../shared/workflow/graph.ts";
import { WorkflowManifest } from "../../../shared/workflow/manifest.ts";
import { HttpError } from "../../lib/http.ts";
import type { LayoutService } from "../layouts.ts";
import type { WorkflowService } from "./store.ts";

export const BUNDLE_FORMAT = "blombo.bundle/1";
export const BUNDLE_EXTENSION = ".blombo";

const BundleHeader = z.object({
  format: z.literal(BUNDLE_FORMAT),
  app: z.string().optional(),
  version: z.string().optional(),
  exportedAt: z.string().optional(),
});

const PARTS = new Set([
  "blombo.json",
  "workflow.json",
  "prompt.json",
  "graph.json",
  "layout.json",
  "thumb.webp",
]);
/** Per entry, uncompressed. */
const MAX_PART_BYTES = 64 * 1024 * 1024;

export interface BundleParts {
  manifest: WorkflowManifest;
  prompt: ApiPrompt;
  graph: unknown | null;
  layout: LayoutDocument | null;
  thumb: Uint8Array | null;
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`);

export function writeBundle(
  parts: BundleParts,
  app: { name: string; version: string },
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "blombo.json": json({
      format: BUNDLE_FORMAT,
      app: app.name,
      version: app.version,
      exportedAt: new Date().toISOString(),
    }),
    "workflow.json": json(parts.manifest),
    "prompt.json": json(parts.prompt),
  };
  if (parts.graph) files["graph.json"] = json(parts.graph);
  if (parts.layout) files["layout.json"] = json(parts.layout);
  // WebP is already compressed.
  const out: Parameters<typeof zipSync>[0] = { ...files };
  if (parts.thumb) out["thumb.webp"] = [parts.thumb, { level: 0 }];
  return zipSync(out, { level: 6 });
}

const BAD = "That .blombo file is damaged or wasn't made by BlomboUI.";

export function readBundle(bytes: Uint8Array): BundleParts {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => PARTS.has(f.name) && f.originalSize <= MAX_PART_BYTES,
    });
  } catch {
    throw new HttpError(400, BAD, "bad_bundle");
  }
  const read = (name: string): unknown => {
    const data = files[name];
    if (!data) return undefined;
    try {
      return JSON.parse(strFromU8(data));
    } catch {
      throw new HttpError(400, BAD, "bad_bundle");
    }
  };
  const header = BundleHeader.safeParse(read("blombo.json"));
  if (!header.success) throw new HttpError(400, BAD, "bad_bundle");
  const manifest = WorkflowManifest.safeParse(read("workflow.json"));
  const prompt = ApiPrompt.safeParse(read("prompt.json"));
  if (!manifest.success || !prompt.success || Object.keys(prompt.data).length === 0)
    throw new HttpError(400, BAD, "bad_bundle");
  const layoutRaw = read("layout.json");
  const layout = layoutRaw === undefined ? null : LayoutDocument.safeParse(layoutRaw);
  const thumb = files["thumb.webp"] ?? null;
  return {
    manifest: manifest.data,
    prompt: prompt.data,
    graph: read("graph.json") ?? null,
    layout: layout?.success ? layout.data : null,
    // Only a real WebP ("RIFF….WEBP").
    thumb:
      thumb &&
      strFromU8(thumb.subarray(0, 4)) === "RIFF" &&
      strFromU8(thumb.subarray(8, 12)) === "WEBP"
        ? thumb
        : null,
  };
}

/** A name that isn't taken yet: "Portrait" → "Portrait copy" → "Portrait copy 2". */
export function freeName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const base = `${name.slice(0, 74)} copy`;
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const next = `${base} ${n}`;
    if (!used.has(next.toLowerCase())) return next;
  }
}

/** "Night portrait" → "Night portrait.blombo", without characters Windows can't store. */
export function bundleFileName(name: string): string {
  const safe = [...name]
    .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "workflow"}${BUNDLE_EXTENSION}`;
}

/** Everything a workflow's .blombo holds, read from the profile. */
export async function exportBundle(
  id: string,
  deps: {
    workflows: Pick<WorkflowService, "get" | "prompt" | "graph" | "thumb">;
    layouts: Pick<LayoutService, "find">;
    app: { name: string; version: string };
  },
): Promise<{ name: string; bytes: Uint8Array }> {
  const manifest = await deps.workflows.get(id);
  const layout = manifest.layout ? await deps.layouts.find(manifest.layout) : null;
  const bytes = writeBundle(
    {
      manifest,
      prompt: await deps.workflows.prompt(id),
      graph: await deps.workflows.graph(id),
      layout,
      thumb: await deps.workflows.thumb(id),
    },
    deps.app,
  );
  return { name: bundleFileName(manifest.name), bytes };
}
