/**
 * Workflow package manifest (ADR-0003): workflows/<id>/workflow.json. Bindings map UI
 * parameters to (node id, input name) in prompt.json; `values` holds the current settings,
 * so there are no separate templates.
 */
import { z } from "zod";
import { MODEL_KINDS } from "../constants.ts";
import { ROLES, STAGES } from "./roles.ts";

export const BindingType = z.enum([
  "prompt",
  "int",
  "float",
  "enum",
  "bool",
  "string",
  "seed",
  "model",
  "image",
]);
export type BindingType = z.infer<typeof BindingType>;

export const Binding = z.object({
  /** Stable id: the role when there is one ("sampler.steps"), else "n<node>.<input>". */
  id: z.string().min(1),
  role: z.enum(ROLES).optional(),
  node: z.string(),
  input: z.string(),
  type: BindingType,
  label: z.string(),
  group: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.string()).optional(),
  modelKind: z.enum(MODEL_KINDS).optional(),
  /** Suggested quick values for the `chips` control style. */
  presets: z.array(z.union([z.number(), z.string()])).optional(),
  hidden: z.boolean().default(false),
});
export type Binding = z.infer<typeof Binding>;

export const WorkflowManifest = z.object({
  format: z.literal("blombo.workflow/1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(80),
  kind: z.enum(["generate", "batch"]),
  family: z.string().default("Custom"),
  icon: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Set when duplicated from another workflow. */
  parentId: z.string().nullable().default(null),
  /** Set when installed from presets/workflows/<presetId>. */
  preset: z.object({ id: z.string(), version: z.number().int() }).nullable().default(null),
  bindings: z.array(Binding),
  values: z.record(z.string(), z.unknown()).default({}),
  stages: z.partialRecord(z.enum(STAGES), z.record(z.string(), z.unknown())).default({}),
  /** Linked layout id; null → the profile's default layout. */
  layout: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowManifest = z.infer<typeof WorkflowManifest>;

/** Resolve a layout bind target ("role:sampler.steps" | "id:n14.sharpness") against bindings. */
export function resolveBind(bindings: Binding[], target: string): Binding | undefined {
  if (target.startsWith("role:")) {
    const role = target.slice(5);
    return bindings.find((b) => b.role === role);
  }
  if (target.startsWith("id:")) {
    const id = target.slice(3);
    return bindings.find((b) => b.id === id);
  }
  return undefined;
}
