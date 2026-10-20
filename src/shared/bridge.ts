/**
 * blombo-bridge (ADR-0009): the ComfyUI extension that loads a Blombo workflow into ComfyUI's
 * canvas and sends it back. These are the shapes of /api/bridge/* (called from ComfyUI's page)
 * and of the edit session Blombo opens. The extension itself is plain JS in src/comfy-bridge/.
 */
import { z } from "zod";
import { ApiPrompt } from "./workflow/graph.ts";

/**
 * The extension's version. Bump it when src/comfy-bridge changes: managed slots get the new copy
 * on their next start, and Settings → ComfyUI says an external install is out of date.
 */
export const BRIDGE_VERSION = 1;

/** Folder name under ComfyUI's custom_nodes/ (also its /extensions/<name>/ URL). */
export const BRIDGE_FOLDER = "blombo-bridge";

/** Sessions expire if nothing is saved for this long. */
export const BRIDGE_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** POST /api/workflows/:id/edit-session → the page Blombo opens in a new window. */
export const EditSession = z.object({
  token: z.string(),
  /** ComfyUI with ?blombo=<token>&blombo_api=<Blombo's origin>. */
  url: z.string(),
  expiresAt: z.string(),
});
export type EditSession = z.infer<typeof EditSession>;

/** GET /api/bridge/session/:token, what the extension loads. */
export const BridgeSession = z.object({
  workflowId: z.string(),
  name: z.string(),
  /** The UI graph for app.loadGraphData (generated from prompt.json when the package has none). */
  graph: z.unknown(),
  profileName: z.string(),
});
export type BridgeSession = z.infer<typeof BridgeSession>;

/** What ComfyUI's app.graphToPrompt() returns, as the extension posts it. */
export const BridgeGraphs = z.object({
  /** The UI graph (LiteGraph serialization). */
  workflow: z.record(z.string(), z.unknown()),
  /** The API graph. */
  output: ApiPrompt,
});

export const BridgeSaveBody = BridgeGraphs.extend({
  /** overwrite: replace the workflow (values kept); copy: a new workflow next to it. */
  mode: z.enum(["overwrite", "copy"]),
});
export type BridgeSaveBody = z.infer<typeof BridgeSaveBody>;

/** Send to Blombo from any canvas (no session): a new workflow in the open profile. */
export const BridgeImportBody = BridgeGraphs.extend({
  name: z.string().trim().min(1).max(80).optional(),
});
export type BridgeImportBody = z.infer<typeof BridgeImportBody>;

/** What a re-sync kept, added and dropped (by label), for the toast on both sides. */
export const ResyncReport = z.object({
  /** Parameters that kept their value. */
  kept: z.number().int(),
  /** Parameters whose value was changed in ComfyUI (the new value is kept). */
  changed: z.array(z.string()).default([]),
  added: z.array(z.string()),
  removed: z.array(z.string()),
});
export type ResyncReport = z.infer<typeof ResyncReport>;

export const BridgeSaveResult = z.object({
  workflowId: z.string(),
  name: z.string(),
  copy: z.boolean(),
  report: ResyncReport,
  /** A fresh token to save again from the same window (each token saves once). */
  next: z.string().nullable(),
  /** One line for the extension's toast. */
  message: z.string(),
});
export type BridgeSaveResult = z.infer<typeof BridgeSaveResult>;

/** Is the extension loaded in the ComfyUI the open profile uses? */
export const BridgeStatus = z.object({
  state: z.enum(["loaded", "outdated", "missing", "unknown"]),
  /** The version ComfyUI serves, when it serves one. */
  version: z.number().int().nullable(),
  expected: z.number().int(),
  mode: z.enum(["managed", "external"]),
  message: z.string(),
});
export type BridgeStatus = z.infer<typeof BridgeStatus>;

/** Copy the extension into a ComfyUI you run yourself (its folder, or its custom_nodes). */
export const InstallBridgeBody = z.object({ folder: z.string().trim().min(1).max(1000) });

/** Plain-language summary of a re-sync ("2 new parameters, 1 removed"). */
export function describeResync(report: ResyncReport): string {
  const parts: string[] = [];
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  if (report.added.length) parts.push(`${n(report.added.length, "new parameter")}`);
  if (report.changed.length) parts.push(`${report.changed.length} changed in ComfyUI`);
  if (report.removed.length) parts.push(`${report.removed.length} removed`);
  if (!parts.length) return report.kept ? "All parameters kept their values" : "No parameters";
  return parts.join(", ");
}
