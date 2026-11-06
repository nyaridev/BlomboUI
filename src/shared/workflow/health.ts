/**
 * What a workflow needs that ComfyUI doesn't have (ADR-0018): custom nodes, grouped by the pack
 * that provides them, and model files, each with the way to get it when Blombo knows one.
 * `services/workflows/health.ts` works it out; Generate shows it above the prompt.
 */
import { z } from "zod";
import { MODEL_KINDS } from "../constants.ts";
import { NodePack } from "./packs.ts";

/** Where Blombo found the pack for a node class. */
export const PACK_SOURCES = ["workflow", "manager", "blombo"] as const;

export const MissingPack = NodePack.extend({
  /**
   * workflow: the canvas names its repository (ComfyUI saves it per node); manager:
   * ComfyUI-Manager's node list; blombo: a pack Blombo's own stages or presets pin.
   */
  source: z.enum(PACK_SOURCES),
});
export type MissingPack = z.infer<typeof MissingPack>;

export const ModelSource = z.discriminatedUnion("source", [
  /** The same file in ComfyUI-Manager's model catalog. */
  z.object({
    source: z.literal("manager"),
    entryId: z.string(),
    size: z.number().nullable(),
    host: z.string(),
  }),
  /** A Hugging Face link the workflow itself carries (ComfyUI saves one per model it knows). */
  z.object({ source: z.literal("url"), url: z.string().url(), host: z.string() }),
]);
export type ModelSource = z.infer<typeof ModelSource>;

export const MissingModel = z.object({
  file: z.string(),
  /** The models folder it belongs in, when the input or the workflow says. */
  kind: z.enum(MODEL_KINDS).nullable(),
  /** The node inputs that name it ("4 · ckpt_name"). */
  nodes: z.array(z.string()),
  download: ModelSource.nullable(),
});
export type MissingModel = z.infer<typeof MissingModel>;

export const WorkflowHealth = z.object({
  /** False while ComfyUI is down: nothing could be checked. */
  checked: z.boolean(),
  packs: z.array(MissingPack),
  /** Node classes no list knows; the user can say which GitHub repository has them. */
  unknownNodes: z.array(z.string()),
  models: z.array(MissingModel),
  /** The canvas has nodes the workflow left out at import that ComfyUI knows now. */
  rebuild: z.boolean(),
});
export type WorkflowHealth = z.infer<typeof WorkflowHealth>;

/** Install the packs a workflow needs; `repo` names the repository for unknown classes. */
export const HealthInstallBody = z.object({
  packs: z.array(NodePack.shape.url).max(20).default([]),
  repo: z
    .object({ url: NodePack.shape.url, nodes: z.array(z.string().min(1)).min(1).max(200) })
    .optional(),
});
export type HealthInstallBody = z.input<typeof HealthInstallBody>;

/** Download a model the health check found a source for. */
export const HealthDownloadBody = z.object({ file: z.string().min(1).max(260) });
