/**
 * Generate layout documents (ADR-0005). The Generate screen is rendered from this data; the
 * default layout is just one document. Blocks bind by role (portable) or binding id.
 */
import { z } from "zod";
import { STAGES } from "../workflow/roles.ts";

export const CONTROL_STYLES = {
  number: ["slider", "scrub", "number", "chips"],
  enum: ["select", "segmented", "chips"],
  bool: ["switch", "checkbox"],
  string: ["text", "textarea"],
} as const;
export type ControlFamily = keyof typeof CONTROL_STYLES;
export type ControlStyle = (typeof CONTROL_STYLES)[ControlFamily][number];

export const FEATURES = [
  "loaded-models",
  "prompts",
  "generate-actions",
  "resolution",
  "seed",
  "image-stage",
] as const;
export type FeatureId = (typeof FEATURES)[number];

const common = {
  id: z.string().min(1),
  hidden: z.boolean().optional(),
  /** Columns out of 12. */
  span: z.number().int().min(1).max(12).optional(),
};

export const ParamBlock = z.object({
  type: z.literal("param"),
  bind: z.string().regex(/^(role|id):.+/),
  control: z.string().optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
  label: z.enum(["top", "inside", "hidden"]).optional(),
  title: z.string().max(40).optional(),
  ...common,
});
export const FeatureBlock = z.object({
  type: z.literal("feature"),
  feature: z.enum(FEATURES),
  ...common,
});
export const StageBlock = z.object({ type: z.literal("stage"), stage: z.enum(STAGES), ...common });
export const RestBlock = z.object({
  type: z.literal("params-rest"),
  title: z.string().max(40).optional(),
  ...common,
});
export const CardBlock = z.object({
  type: z.literal("card"),
  title: z.string().max(40),
  icon: z.string().optional(),
  children: z.array(z.discriminatedUnion("type", [ParamBlock, FeatureBlock])),
  ...common,
});

export const Block = z.discriminatedUnion("type", [
  ParamBlock,
  FeatureBlock,
  StageBlock,
  RestBlock,
  CardBlock,
]);
export type Block = z.infer<typeof Block>;
export type ParamBlock = z.infer<typeof ParamBlock>;
export type CardBlock = z.infer<typeof CardBlock>;

export const REGIONS = ["models", "prompt", "actions", "params", "stage"] as const;
export type RegionId = (typeof REGIONS)[number];

export const LayoutDocument = z.object({
  format: z.literal("blombo.layout/1"),
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  regions: z.object({
    models: z.array(Block),
    prompt: z.array(Block),
    actions: z.array(Block),
    params: z.array(Block),
    stage: z.array(Block),
  }),
  sizes: z.object({ params: z.number().min(300).max(720).default(420) }).default({ params: 420 }),
});
export type LayoutDocument = z.infer<typeof LayoutDocument>;

export function controlFamily(type: string): ControlFamily | null {
  if (type === "int" || type === "float") return "number";
  if (type === "enum") return "enum";
  if (type === "bool") return "bool";
  if (type === "string") return "string";
  return null;
}

/* ── layout presets (data/profiles/<id>/layouts/<layoutId>.json) ─────────── */

/** Ids of the profile's own layouts; built-in ones (presets/layouts/) keep theirs. */
export const LayoutId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/, "Invalid layout id");

export const LayoutList = z.object({
  builtins: z.array(LayoutDocument),
  custom: z.array(LayoutDocument),
  /** What workflows without a linked layout show (Settings → generate.layout). */
  defaultId: z.string(),
});
export type LayoutList = z.infer<typeof LayoutList>;

export const CreateLayoutBody = z.object({
  name: z.string().trim().min(1).max(60),
  doc: LayoutDocument,
  /** Also link the new layout to this workflow. */
  linkTo: z.string().optional(),
});
export type CreateLayoutBody = z.infer<typeof CreateLayoutBody>;

export const SaveLayoutBody = z.object({ doc: LayoutDocument });
export const RenameLayoutBody = z.object({ name: z.string().trim().min(1).max(60) });
