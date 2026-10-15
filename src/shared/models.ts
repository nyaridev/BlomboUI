/**
 * Local models: files under the profile's models root, grouped by kind. Sidecar files next to
 * a model (same name, other extension) give it a thumbnail and Civitai-style info:
 *
 *   foo.safetensors
 *   foo.preview.png | foo.png | foo.jpg | foo.webp | foo.gif     thumbnail
 *   foo.civitai.info                                              Civitai model/version JSON
 *   foo.json                                                      A1111 extra-network notes
 */
import { z } from "zod";
import { MODEL_KINDS, type ModelKind } from "./constants.ts";
import { SafetensorsInfo } from "./safetensors.ts";

export const MODEL_EXTENSIONS = [
  ".safetensors",
  ".ckpt",
  ".pt",
  ".pth",
  ".bin",
  ".gguf",
  ".sft",
  ".onnx",
] as const;

/** Folders under the models root for each kind, in the order ComfyUI reads them. */
export const MODEL_FOLDERS: Record<ModelKind, string[]> = {
  checkpoints: ["checkpoints"],
  diffusion_models: ["diffusion_models", "unet"],
  loras: ["loras"],
  vae: ["vae"],
  text_encoders: ["text_encoders", "clip"],
  upscale_models: ["upscale_models"],
  controlnet: ["controlnet", "t2i_adapter"],
  embeddings: ["embeddings"],
  sams: ["sams"],
  ultralytics: ["ultralytics"],
};

/** Sidecar thumbnail names, best first ("foo" + suffix). */
export const THUMB_SUFFIXES = [
  ".preview.png",
  ".preview.webp",
  ".preview.jpg",
  ".preview.jpeg",
  ".png",
  ".webp",
  ".jpg",
  ".jpeg",
  ".gif",
] as const;

export const LocalModel = z.object({
  /** Path inside the models root with forward slashes ("loras/style/foo.safetensors"). */
  id: z.string(),
  kind: z.enum(MODEL_KINDS),
  /** Display name: Civitai's name when known, else the file name without extension. */
  name: z.string(),
  file: z.string(),
  /** Subfolder inside the kind folder ("" or "style/anime"). */
  folder: z.string(),
  size: z.number(),
  mtime: z.number(),
  thumb: z.string().nullable(),
  /** Marked NSFW by its sidecar info (unknown counts as not NSFW). */
  nsfw: z.boolean(),
  baseModel: z.string().nullable(),
  triggerWords: z.array(z.string()),
  hasInfo: z.boolean(),
  /**
   * The Civitai model and version this file is, from its .civitai.info file or, without one,
   * from a lookup by hash (`lookup`; nothing is written next to the model then).
   */
  civitai: z
    .object({ modelId: z.number(), versionId: z.number(), lookup: z.boolean() })
    .nullable()
    .default(null),
});
export type LocalModel = z.infer<typeof LocalModel>;

/** Background hashing and Civitai lookup of local models (Models → Local shows it). */
export const LookupState = z.object({
  running: z.boolean(),
  /** Models checked so far in this run, out of `total`. */
  done: z.number().int(),
  total: z.number().int(),
  /** Matched on Civitai in this run. */
  found: z.number().int(),
  /** The file being hashed right now. */
  current: z.string().nullable(),
  /** Why the last run stopped early (Civitai unreachable…). */
  error: z.string().nullable(),
});
export type LookupState = z.infer<typeof LookupState>;

/** What a lookup by hash learned about a local model. */
export const LookupInfo = z.object({
  modelId: z.number(),
  versionId: z.number(),
  name: z.string(),
  version: z.string().nullable(),
  type: z.string().nullable(),
  baseModel: z.string().nullable(),
  trainedWords: z.array(z.string()),
  nsfw: z.boolean(),
  creator: z.string().nullable(),
  /** Proxied first image. */
  image: z.string().nullable(),
  imageNsfw: z.boolean(),
  description: z.string().nullable(),
});
export type LookupInfo = z.infer<typeof LookupInfo>;

export const ModelList = z.object({
  root: z.string(),
  exists: z.boolean(),
  models: z.array(LocalModel),
  totalSize: z.number(),
  scannedAt: z.number(),
});
export type ModelList = z.infer<typeof ModelList>;

export const ModelDetails = LocalModel.extend({
  path: z.string(),
  sidecars: z.array(z.string()),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  civitai: z
    .object({
      modelId: z.number().nullable(),
      versionId: z.number().nullable(),
      name: z.string().nullable(),
      version: z.string().nullable(),
      creator: z.string().nullable(),
      url: z.string().nullable(),
    })
    .nullable(),
  /** Suggested strength from the sidecar ("preferred weight"). */
  weight: z.number().nullable(),
  header: SafetensorsInfo.nullable(),
  headerError: z.string().nullable(),
  /** Folders inside this kind, for "Move to". */
  folders: z.array(z.string()),
});
export type ModelDetails = z.infer<typeof ModelDetails>;

/** A file name may not contain path separators or characters Windows refuses. */
export const ModelFileStem = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (s) => !/[\\/:*?"<>|]/.test(s) && !/^\.+$/.test(s),
    'Use a name without \\ / : * ? " < > |',
  );

export const RenameModelBody = z.object({ id: z.string().min(1), name: ModelFileStem });
export const MoveModelBody = z.object({
  id: z.string().min(1),
  /** Destination subfolder inside the same kind folder ("" = the kind folder itself). */
  folder: z.string().max(400),
});
export const ModelIdBody = z.object({ id: z.string().min(1) });

/** Base-model labels shown on cards ("SDXL 1.0" → "SDXL"). */
export function shortBaseModel(base: string | null): string | null {
  if (!base) return null;
  const b = base.trim();
  const known: Array<[RegExp, string]> = [
    [/illustrious/i, "IL"],
    [/noob/i, "NoobAI"],
    [/pony/i, "Pony"],
    [/sdxl|sd_xl|xl/i, "SDXL"],
    [/sd\s*1\.?5|sd15|v1-5/i, "SD1.5"],
    [/flux/i, "Flux"],
    [/sd\s*3/i, "SD3"],
  ];
  for (const [re, label] of known) if (re.test(b)) return label;
  return b.length > 10 ? b.slice(0, 10) : b;
}
