/**
 * Workflow package manifest (ADR-0003): workflows/<id>/workflow.json. Bindings map UI
 * parameters to (node id, input name) in prompt.json; `values` holds the current settings,
 * so there are no separate templates.
 */
import { z } from "zod";
import { MODEL_KINDS } from "../constants.ts";
import { LayoutDocument } from "../layout/schema.ts";
import { NodePack } from "./packs.ts";
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
  /** A LoRA stack node (role lora.stack). Its value is filled from <lora:…> tags at run time. */
  "loras",
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
  /** Long text (a multiline STRING input): shown as a text area. */
  multiline: z.boolean().optional(),
  hidden: z.boolean().default(false),
});
export type Binding = z.infer<typeof Binding>;

/** What happens to the seed after each run. */
export const SEED_MODES = ["random", "fixed", "increment", "decrement"] as const;
export const SeedMode = z.enum(SEED_MODES);
export type SeedMode = z.infer<typeof SeedMode>;

/** Generate-button settings that belong to the workflow, saved like any other value. */
export const RunSettings = z.object({
  seedMode: SeedMode.default("random"),
  /** Runs queued per click (each run is one ComfyUI prompt with its own seed). */
  count: z.number().int().min(1).max(100).default(1),
});
export type RunSettings = z.infer<typeof RunSettings>;

/** Saved stage settings, loosely: each stage's schema fills defaults when read. */
export const StagesRecord = z.partialRecord(z.enum(STAGES), z.record(z.string(), z.unknown()));

export const WorkflowManifest = z.object({
  format: z.literal("blombo.workflow/1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(80),
  kind: z.enum(["generate", "batch"]),
  family: z.string().default("Custom"),
  description: z.string().max(300).optional(),
  icon: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Set when duplicated from another workflow. */
  parentId: z.string().nullable().default(null),
  /** Set when installed from presets/workflows/<presetId>. */
  preset: z.object({ id: z.string(), version: z.number().int() }).nullable().default(null),
  bindings: z.array(Binding),
  values: z.record(z.string(), z.unknown()).default({}),
  run: RunSettings.default({ seedMode: "random", count: 1 }),
  /** Stage settings (shared/workflow/stages.ts reads them with defaults: `readStages`). */
  stages: StagesRecord.default({}),
  /** Linked layout id; null → the profile's default layout. */
  layout: z.string().nullable().default(null),
  /**
   * Custom node packs a built-in workflow needs (pinned, so Install can add them to a managed
   * slot). Only presets carry them; the installer trusts the presets folder, not this field.
   */
  packs: z.array(NodePack).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowManifest = z.infer<typeof WorkflowManifest>;

/**
 * A workflow as the Generate screen loads it: the manifest with live model choices, plus the
 * layout it shows (the linked one, or the profile's default when none is linked or it's gone).
 */
export const WorkflowDetail = WorkflowManifest.extend({
  layoutDoc: LayoutDocument,
  /** "linked": manifest.layout found; "default": the profile's default layout. */
  layoutSource: z.enum(["linked", "default"]),
});
export type WorkflowDetail = z.infer<typeof WorkflowDetail>;

/** One row in the workflow picker. */
export const WorkflowSummary = WorkflowManifest.pick({
  id: true,
  name: true,
  kind: true,
  family: true,
  tags: true,
  parentId: true,
  preset: true,
  updatedAt: true,
});
export type WorkflowSummary = z.infer<typeof WorkflowSummary>;

/** A built-in preset the user can install into a profile. */
export const PresetSummary = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["generate", "batch"]),
  family: z.string(),
  description: z.string(),
  version: z.number().int(),
  /** True when the active profile already has a workflow installed from it. */
  installed: z.boolean(),
});
export type PresetSummary = z.infer<typeof PresetSummary>;

/** Something the analyzer or importer wants the user to know. */
export const Finding = z.object({
  level: z.enum(["info", "warning", "error"]),
  code: z.string(),
  message: z.string(),
  node: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const PatchValuesBody = z.object({
  values: z.record(z.string(), z.unknown()),
  run: RunSettings.partial().optional(),
  /** Whole stage objects to replace ("hires" → its settings). */
  stages: StagesRecord.optional(),
});
export type PatchValuesBody = z.infer<typeof PatchValuesBody>;

export const UpdateWorkflowBody = z.object({
  name: WorkflowManifest.shape.name.optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  /** Link a layout (its id) or go back to the profile's default (null). */
  layout: z.string().min(1).max(80).nullable().optional(),
});
export type UpdateWorkflowBody = z.infer<typeof UpdateWorkflowBody>;

export const DuplicateWorkflowBody = z.object({ name: WorkflowManifest.shape.name.optional() });

export const ImportResult = z.object({
  workflow: WorkflowManifest,
  /** Which kind of file it came from. */
  source: z.enum(["api", "ui", "png", "webp", "blombo"]),
  findings: z.array(Finding),
});
export type ImportResult = z.infer<typeof ImportResult>;

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

/** The binding for a role, if the workflow has one. */
export function bindingFor(bindings: Binding[], role: string): Binding | undefined {
  return bindings.find((b) => b.role === role);
}
