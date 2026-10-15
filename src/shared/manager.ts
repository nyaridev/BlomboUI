/**
 * Models → Manager: the ComfyUI model catalog (ComfyUI-Manager's model-list.json) shown as a
 * store. Each entry names a file, where ComfyUI expects it ("upscale_models", "ultralytics/bbox"
 * or "default" for its type's folder) and a download URL. Installing goes through the download
 * queue into the profile's models folder.
 */
import { z } from "zod";
import { MODEL_KINDS, type ModelKind } from "./constants.ts";
import { MODEL_FOLDERS } from "./models.ts";

export const STORE_CATEGORIES = [
  "checkpoints",
  "diffusion",
  "loras",
  "vae",
  "text-encoders",
  "upscalers",
  "controlnet",
  "detectors",
  "face",
  "ip-adapter",
  "video",
  "other",
] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const STORE_CATEGORY_LABELS: Record<StoreCategory, string> = {
  checkpoints: "Checkpoints",
  diffusion: "Diffusion models",
  loras: "LoRAs",
  vae: "VAE",
  "text-encoders": "Text encoders",
  upscalers: "Upscalers",
  controlnet: "ControlNet",
  detectors: "Detectors and SAM",
  face: "Face",
  "ip-adapter": "IP-Adapter and CLIP vision",
  video: "Video",
  other: "Other",
};

const TYPE_CATEGORY: Record<string, StoreCategory> = {
  checkpoint: "checkpoints",
  unclip: "checkpoints",
  diffusion_model: "diffusion",
  lora: "loras",
  "motion lora": "video",
  vae: "vae",
  taesd: "vae",
  clip: "text-encoders",
  upscale: "upscalers",
  rgt: "upscalers",
  controlnet: "controlnet",
  "t2i-adapter": "controlnet",
  "t2i-style": "controlnet",
  ultralytics: "detectors",
  sam: "detectors",
  sam2: "detectors",
  "sam2.1": "detectors",
  efficient_sam: "detectors",
  groundingdino: "detectors",
  face_restore: "face",
  gfpgan: "face",
  codeformer: "face",
  facexlib: "face",
  insightface: "face",
  instantid: "face",
  pulid: "face",
  photomaker: "face",
  "ip-adapter": "ip-adapter",
  clip_vision: "ip-adapter",
  animatediff: "video",
  "animatediff-pia": "video",
  zero123: "video",
  framepacki2v: "video",
};

export function storeCategory(type: string): StoreCategory {
  return TYPE_CATEGORY[type.toLowerCase()] ?? "other";
}

/** Where "default" puts each type (ComfyUI-Manager's own mapping, for the types we place). */
const DEFAULT_FOLDERS: Record<string, string> = {
  checkpoint: "checkpoints",
  unclip: "checkpoints",
  diffusion_model: "diffusion_models",
  lora: "loras",
  vae: "vae",
  taesd: "vae_approx",
  clip: "text_encoders",
  upscale: "upscale_models",
  controlnet: "controlnet",
  "t2i-adapter": "controlnet",
  "t2i-style": "style_models",
  clip_vision: "clip_vision",
  gligen: "gligen",
  embedding: "embeddings",
  embeddings: "embeddings",
  ultralytics: "ultralytics",
  sam: "sams",
  photomaker: "photomaker",
  "ip-adapter": "ipadapter",
  insightface: "insightface",
};

/** The folder inside the models root an entry installs into, or null when it isn't one. */
export function catalogFolder(type: string, savePath: string): string | null {
  const raw =
    savePath === "default" ? (DEFAULT_FOLDERS[type.toLowerCase()] ?? null) : savePath.trim();
  if (!raw) return null;
  const clean = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean || clean.split("/").some((p) => p === ".." || p === "." || p === "")) return null;
  // ComfyUI-Manager can also install into custom node folders; those aren't model folders.
  if (clean.startsWith("custom_nodes")) return null;
  return clean;
}

/** The model kind a folder belongs to ("ultralytics/bbox" → ultralytics), when Blombo lists it. */
export function kindOfFolder(folder: string): ModelKind | null {
  const top = folder.split("/")[0]?.toLowerCase() ?? "";
  for (const kind of MODEL_KINDS) if (MODEL_FOLDERS[kind].includes(top)) return kind;
  return null;
}

export const CatalogEntry = z.object({
  /** Stable id from the folder and file name. */
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.enum(STORE_CATEGORIES),
  base: z.string().nullable(),
  description: z.string(),
  /** Project page (opened in the system browser). */
  reference: z.string().nullable(),
  filename: z.string(),
  /** Folder inside the models root; null when Blombo can't place it. */
  folder: z.string().nullable(),
  kind: z.enum(MODEL_KINDS).nullable(),
  size: z.number().nullable(),
  /** ComfyUI reads this folder from Blombo's models root (it's in extra_model_paths.yaml). */
  standard: z.boolean(),
  installed: z.boolean(),
  /** Download host, shown next to the button ("huggingface.co"). */
  host: z.string(),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;

export const Catalog = z.object({
  entries: z.array(CatalogEntry),
  /** When the catalog was fetched (ms); it's cached for a day. */
  fetchedAt: z.number(),
  /** The catalog came from the cache because the network failed. */
  stale: z.boolean(),
  /** The profile has no models folder: nothing can be installed. */
  noModelsFolder: z.boolean(),
});
export type Catalog = z.infer<typeof Catalog>;
