/**
 * Stages (ADR-0004): Hires fix, ADetailer and ControlNet as graph patches. Two shapes live here:
 *
 *  - StagePackage: presets/stages/<id>/stage.json, which tells the compiler how to splice that
 *    package's prompt.json (an API graph with PORT:<ROLE> stub nodes) into a workflow.
 *  - Stage settings: what the user set, saved in the workflow manifest under `stages`. Fields
 *    that mirror the base sampler (steps, CFG, sampler, scheduler, prompts) inherit the base
 *    value until they're listed in `unlinked`.
 *
 * Plus the pure helpers both sides need: which family a workflow is, how inherited values
 * resolve, and the size a Hires pass ends at.
 */
import { z } from "zod";
import { MODEL_KINDS } from "../constants.ts";
import { salvage } from "../salvage.ts";
import { type Binding, bindingFor } from "./manifest.ts";
import { NodePack } from "./packs.ts";
import {
  SOURCE_MODES,
  type SourceMode,
  STAGES,
  type StageId,
  type WorkflowMedia,
} from "./roles.ts";

export { SOURCE_MODES, type SourceMode } from "./roles.ts";

/**
 * Splice points. The compiler finds them in any graph (services/workflows/analyze.ts). START is
 * the latent going into the main sampler (the empty one, in a text-to-image graph). VIDEO is the
 * empty video latent in a video graph: START itself, or what an audio + video latent is built from.
 */
export const PORTS = [
  "MODEL",
  "CLIP",
  "VAE",
  "POSITIVE",
  "NEGATIVE",
  "START",
  "VIDEO",
  "LATENT",
  "IMAGE",
] as const;
export const Port = z.enum(PORTS);
export type Port = z.infer<typeof Port>;

/** Stages run in this order, with the workflow's own sampling between controlnet and hires. */
export const STAGE_ORDER: readonly StageId[] = [
  "source",
  "controlnet",
  "hires",
  "adetailer",
  "upscale",
];

/** Checkpoint graphs (one file, real negative prompt) or diffusion-model graphs (UNET + CLIP + VAE). */
export const STAGE_FAMILIES = ["checkpoint", "diffusion"] as const;
export const StageFamily = z.enum(STAGE_FAMILIES);
export type StageFamily = z.infer<typeof StageFamily>;

export const STAGE_LABELS: Record<StageId, string> = {
  source: "Image to image",
  controlnet: "ControlNet",
  hires: "Hires fix",
  adetailer: "ADetailer",
  upscale: "Upscale",
};

/* ── packages ────────────────────────────────────────────────────────────── */

export { NodePack } from "./packs.ts";

/** Where a resolved stage value goes in the stage graph. */
export const StageField = z.object({
  field: z.string(),
  node: z.string(),
  input: z.string(),
  /** A model choice: checked against ComfyUI's list for that folder. */
  modelKind: z.enum(MODEL_KINDS).optional(),
  /** How the UI and messages name it ("Detector"). */
  label: z.string().optional(),
});
export type StageField = z.infer<typeof StageField>;

export const StagePackage = z.object({
  format: z.literal("blombo.stage/1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  stage: z.enum(STAGES),
  family: StageFamily,
  name: z.string(),
  description: z.string().default(""),
  attach: z.enum(["before_sampler", "after_sampler", "after_decode", "before_save"]),
  /** Ports the graph reads (stubs). A workflow without them can't use this package. */
  requires: z.array(Port),
  /** Ports the graph republishes through OUT:<PORT> nodes. */
  provides: z.array(Port),
  packs: z.array(NodePack).default([]),
  fields: z.array(StageField),
  /** Values used when the base workflow has no binding to inherit from (no CFG in Flux graphs). */
  defaults: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  /** Inputs of the workflow's main sampler this stage sets, each from one of its fields. */
  base: z.partialRecord(z.enum(["denoise"]), z.string()).default({}),
  /** First pass (`source`) packages: the modes this one runs. */
  modes: z.array(z.enum(SOURCE_MODES)).default([]),
  /**
   * Node classes the workflow's VIDEO latent must come from for this package to fit (a Wan
   * package never lands on an LTX graph). Empty: any graph with the required ports.
   */
  fits: z.array(z.string()).default([]),
  /**
   * Model files the workflow's loaders switch to while this package runs (from → to): Wan 2.2
   * 14B's frame modes swap its text to video experts and speed LoRAs for the image to video ones.
   * A package with a swap fits only a workflow that uses one of the `from` files.
   */
  swap: z.record(z.string(), z.string()).default({}),
  /**
   * Links into inputs of the workflow's own node at a port (port → input → this graph's node and
   * output): MiniMax H3's frames go into the node that makes its conditioning and latent.
   */
  into: z
    .partialRecord(z.enum(PORTS), z.record(z.string(), z.tuple([z.string(), z.number().int()])))
    .default({}),
});
export type StagePackage = z.infer<typeof StagePackage>;

/* ── settings ────────────────────────────────────────────────────────────── */

/** Fields that follow the base sampler and prompts until unlinked. */
export const INHERIT_FIELDS = [
  "steps",
  "cfg",
  "sampler",
  "scheduler",
  "prompt",
  "negative",
] as const;
export const InheritField = z.enum(INHERIT_FIELDS);
export type InheritField = z.infer<typeof InheritField>;

/** The base role each inheritable field follows. */
export const INHERIT_ROLES: Record<InheritField, string> = {
  steps: "sampler.steps",
  cfg: "sampler.cfg",
  sampler: "sampler.name",
  scheduler: "sampler.scheduler",
  prompt: "prompt.positive",
  negative: "prompt.negative",
};

const inherited = {
  steps: z.number().int().min(1).max(150).default(20),
  cfg: z.number().min(0).max(30).default(7),
  sampler: z.string().default("euler"),
  scheduler: z.string().default("normal"),
  prompt: z.string().max(20_000).default(""),
  negative: z.string().max(20_000).default(""),
  /** Fields with their own value; everything else follows the base workflow. */
  unlinked: z.array(InheritField).default([]),
};

export const HiresSettings = z.object({
  enabled: z.boolean().default(false),
  sizeMode: z.enum(["scale", "target"]).default("scale"),
  scale: z.number().min(1).max(4).default(1.5),
  width: z.number().int().min(64).max(8192).default(1536),
  height: z.number().int().min(64).max(8192).default(1536),
  /** An upscale model file; "" resizes without one. */
  upscaler: z.string().default(""),
  denoise: z.number().min(0).max(1).default(0.35),
  /** Also save the image before the Hires pass. */
  saveFirst: z.boolean().default(false),
  ...inherited,
  steps: z.number().int().min(1).max(150).default(15),
});
export type HiresSettings = z.infer<typeof HiresSettings>;

const UnitId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

export const AdetailerUnit = z.object({
  id: UnitId,
  name: z.string().trim().min(1).max(32),
  enabled: z.boolean().default(true),
  /** UltralyticsDetectorProvider choice ("bbox/face_yolov8m.pt"); "" until picked. */
  detector: z.string().default(""),
  /** SAM model for a tighter mask; "" uses the detector's box or segment. */
  sam: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  /** Grow the detected box, in pixels. */
  dilation: z.number().int().min(-512).max(512).default(10),
  cropFactor: z.number().min(1).max(10).default(3),
  denoise: z.number().min(0.01).max(1).default(0.4),
  /** Mask edge softness, in pixels. */
  feather: z.number().int().min(0).max(100).default(5),
  guideSize: z.number().int().min(64).max(4096).default(512),
  ...inherited,
});
export type AdetailerUnit = z.infer<typeof AdetailerUnit>;

/** An image a stage reads, kept in the profile's inputs/ folder (content-named). */
export const StageImage = z.object({
  file: z.string().regex(/^[a-f0-9]{16}\.(png|jpg|webp)$/),
  source: z.enum(["upload", "gallery", "output"]),
  /** Original file name, for the UI. */
  label: z.string().max(200),
  width: z.number().int(),
  height: z.number().int(),
});
export type StageImage = z.infer<typeof StageImage>;

export const ControlnetUnit = z.object({
  id: UnitId,
  name: z.string().trim().min(1).max(32),
  enabled: z.boolean().default(true),
  image: StageImage.nullable().default(null),
  /** comfyui_controlnet_aux preprocessor ("DWPreprocessor"), or "none" for a ready map. */
  preprocessor: z.string().default("none"),
  /** Detail of the preprocessed map (its shorter side). */
  resolution: z.number().int().min(64).max(4096).default(1024),
  model: z.string().default(""),
  strength: z.number().min(0).max(3).default(1),
  start: z.number().min(0).max(1).default(0),
  end: z.number().min(0).max(1).default(1),
});
export type ControlnetUnit = z.infer<typeof ControlnetUnit>;

export const SOURCE_MODE_LABELS: Record<SourceMode, string> = {
  txt2img: "Text to image",
  img2img: "Image to image",
  inpaint: "Inpaint",
  first: "First frame",
  firstLast: "First and last frame",
};

/** A mode's name for a workflow: starting from nothing is Text to video for video. */
export function sourceModeLabel(mode: SourceMode, media: WorkflowMedia): string {
  return mode === "txt2img" && media === "video" ? "Text to video" : SOURCE_MODE_LABELS[mode];
}

/** The modes every image workflow has; video ones come from the packages that fit. */
export const IMAGE_SOURCE_MODES: SourceMode[] = ["txt2img", "img2img", "inpaint"];

export const SourceSettings = z.object({
  mode: z.enum(SOURCE_MODES).default("txt2img"),
  /**
   * Resized to the workflow's width and height (cropped to fit) before it's encoded. In the
   * video modes, the first frame.
   */
  image: StageImage.nullable().default(null),
  /** First and last frame: the last frame. */
  last: StageImage.nullable().default(null),
  /** The painted mask, the image's size: white is redrawn, black is kept. */
  mask: StageImage.nullable().default(null),
  /** How much the sampler changes the image (the main sampler's denoise). */
  denoise: z.number().min(0.01).max(1).default(0.75),
  /** Inpaint: grow the mask, in pixels of the image. */
  grow: z.number().int().min(0).max(128).default(6),
  /** Inpaint: soften the mask's edge, in pixels. */
  blur: z.number().int().min(0).max(31).default(4),
});
export type SourceSettings = z.infer<typeof SourceSettings>;

/** The source stage runs when the first pass starts from an image. */
export function sourceOn(s: Pick<SourceSettings, "mode">): boolean {
  return s.mode !== "txt2img";
}

export const AdetailerSettings = z.object({
  enabled: z.boolean().default(false),
  units: z
    .array(AdetailerUnit)
    .max(8)
    .default(() => [AdetailerUnit.parse({ id: "face", name: "Face" })]),
});
export type AdetailerSettings = z.infer<typeof AdetailerSettings>;

export const ControlnetSettings = z.object({
  enabled: z.boolean().default(false),
  units: z
    .array(ControlnetUnit)
    .max(8)
    .default(() => [ControlnetUnit.parse({ id: "unit-1", name: "Unit 1" })]),
});
export type ControlnetSettings = z.infer<typeof ControlnetSettings>;

export const StageSettings = z.object({
  source: SourceSettings.prefault({}),
  hires: HiresSettings.prefault({}),
  adetailer: AdetailerSettings.prefault({}),
  controlnet: ControlnetSettings.prefault({}),
});
export type StageSettings = z.infer<typeof StageSettings>;

/** The stage images a run uses: they're sent to ComfyUI before it runs. */
export function stageImageFiles(stages: StageSettings): string[] {
  const { controlnet, source } = stages;
  const units = controlnet.enabled ? controlnet.units.filter((u) => u.enabled) : [];
  const picked = [
    ...units.map((u) => u.image),
    sourceOn(source) ? source.image : null,
    source.mode === "inpaint" ? source.mask : null,
    source.mode === "firstLast" ? source.last : null,
  ];
  return picked.flatMap((image) => (image ? [image.file] : []));
}

/**
 * Stage settings as saved in a manifest. One bad value never resets a stage: a number out of
 * range is pulled to its limit (steps unlinked from a base of 200 become 150), anything else
 * invalid falls back to its own default, and a broken unit is dropped on its own.
 */
export function readStages(raw: unknown): StageSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    source: salvage(SourceSettings, input.source).data,
    hires: salvage(HiresSettings, input.hires).data,
    adetailer: salvage(AdetailerSettings, input.adetailer).data,
    controlnet: salvage(ControlnetSettings, input.controlnet).data,
  };
}

/* ── pure helpers ────────────────────────────────────────────────────────── */

/** Which stage packages fit this workflow. */
export function workflowFamily(bindings: Binding[]): StageFamily {
  return bindingFor(bindings, "model.unet") && !bindingFor(bindings, "model.checkpoint")
    ? "diffusion"
    : "checkpoint";
}

type Inheriting = {
  [K in InheritField]: K extends "steps" ? number : K extends "cfg" ? number : string;
} & {
  unlinked: InheritField[];
};

/**
 * The value a stage uses for an inheritable field: its own when unlinked, else the base
 * workflow's (by role), else the package default, else its own saved value.
 */
export function inheritedValue(
  field: InheritField,
  settings: Inheriting,
  bindings: Binding[],
  values: Record<string, unknown>,
  defaults: Record<string, unknown> = {},
): string | number {
  if (settings.unlinked.includes(field)) return settings[field];
  const b = bindingFor(bindings, INHERIT_ROLES[field]);
  const base = b ? values[b.id] : undefined;
  const numeric = field === "steps" || field === "cfg";
  if (numeric) {
    const n = Number(base);
    if (base !== undefined && base !== "" && Number.isFinite(n)) return n;
  } else if (typeof base === "string") return base;
  const fallback = defaults[field];
  if (numeric ? typeof fallback === "number" : typeof fallback === "string")
    return fallback as string | number;
  return settings[field];
}

const round8 = (n: number) => Math.max(64, Math.round(n / 8) * 8);

/** Where a Hires pass ends, from the base size (null when the workflow has no size). */
export function hiresSize(
  h: Pick<HiresSettings, "sizeMode" | "scale" | "width" | "height">,
  base: { width: number; height: number } | null,
): { width: number; height: number } | null {
  if (h.sizeMode === "target") return { width: round8(h.width), height: round8(h.height) };
  if (!base || !(base.width > 0) || !(base.height > 0)) return null;
  return { width: round8(base.width * h.scale), height: round8(base.height * h.scale) };
}

/** A new unit id that isn't taken. */
export function newUnitId(taken: string[], prefix = "unit"): string {
  for (let n = taken.length + 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** Friendly names for common comfyui_controlnet_aux preprocessors; others show as they are. */
export const PREPROCESSOR_LABELS: Record<string, string> = {
  none: "None (the image is already a map)",
  CannyEdgePreprocessor: "Canny edges",
  LineArtPreprocessor: "Line art",
  AnimeLineArtPreprocessor: "Line art (anime)",
  Manga2Anime_LineArt_Preprocessor: "Line art (manga)",
  LineartStandardPreprocessor: "Line art (standard)",
  ScribblePreprocessor: "Scribble",
  HEDPreprocessor: "Soft edges (HED)",
  PiDiNetPreprocessor: "Soft edges (PiDiNet)",
  "M-LSDPreprocessor": "Straight lines (M-LSD)",
  DWPreprocessor: "Pose (DWPose)",
  OpenposePreprocessor: "Pose (OpenPose)",
  DepthAnythingV2Preprocessor: "Depth Anything v2",
  DepthAnythingPreprocessor: "Depth Anything",
  "MiDaS-DepthMapPreprocessor": "Depth (MiDaS)",
  "Zoe-DepthMapPreprocessor": "Depth (Zoe)",
  "BAE-NormalMapPreprocessor": "Normal map (BAE)",
  TilePreprocessor: "Tile",
  ColorPreprocessor: "Color palette",
  ShufflePreprocessor: "Content shuffle",
  OneFormer_ADE20K_SemSegPreprocessor: "Segmentation (ADE20K)",
};

export function preprocessorLabel(name: string): string {
  return PREPROCESSOR_LABELS[name] ?? name.replace(/Preprocessor$/, "").replace(/[_-]+/g, " ");
}

/* ── status (what the UI shows before you generate) ─────────────────────── */

export const StageProblem = z.object({
  code: z.enum([
    "missing_port",
    "missing_nodes",
    "missing_model",
    "pick_model",
    "no_size",
    "no_image",
  ]),
  message: z.string(),
  /** missing_nodes: the packs to install. */
  packs: z.array(NodePack).optional(),
  /** missing_model / pick_model: which folder to look in. */
  modelKind: z.enum(MODEL_KINDS).optional(),
  /** The unit it's about, for units. */
  unit: z.string().optional(),
});
export type StageProblem = z.infer<typeof StageProblem>;

export const StageStatus = z.object({
  stage: z.enum(STAGES),
  /** The package that would run, or null when none fits this workflow. */
  package: z.string().nullable(),
  family: StageFamily,
  problems: z.array(StageProblem),
  /** Current ComfyUI choices for the stage's model and option fields ("detector" → […]). */
  choices: z.record(z.string(), z.array(z.string())),
});
export type StageStatus = z.infer<typeof StageStatus>;

export const StageReport = z.object({
  /** False while ComfyUI is down: nodes and models couldn't be checked. */
  checked: z.boolean(),
  stages: z.array(StageStatus),
});
export type StageReport = z.infer<typeof StageReport>;

export const CheckStagesBody = z.object({
  workflowId: z.string().min(1),
  /** The settings to check (the client's current ones); the saved ones when left out. */
  stages: z.unknown().optional(),
});

export const GalleryImageBody = z.object({ id: z.number().int() });

export const PreviewMapBody = z.object({
  file: StageImage.shape.file,
  preprocessor: z.string().min(1).max(120),
  resolution: z.number().int().min(64).max(4096),
});

/** A step of a run, for the progress bar ("Base", "Hires fix", "ADetailer · Face"). */
export const RunSegment = z.object({
  id: z.string(),
  label: z.string(),
  /** Sampler-like nodes whose progress belongs to this segment. */
  nodes: z.array(z.string()),
});
export type RunSegment = z.infer<typeof RunSegment>;
