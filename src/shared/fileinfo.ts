/**
 * File Info: what a dropped or picked file says about itself, in readable sections. Images
 * are read on the server (PNG/WebP/JPEG chunks); safetensors headers are read wherever the
 * file is (the browser slices a dropped file, the server reads a model from disk).
 */
import { z } from "zod";
import { ImageSettings, ImageSummary } from "./imageinfo.ts";
import { SafetensorsInfo } from "./safetensors.ts";

export const ComfyNodeInfo = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  /** Widget values only (links to other nodes are left out). */
  inputs: z.array(z.tuple([z.string(), z.unknown()])),
});
export type ComfyNodeInfo = z.infer<typeof ComfyNodeInfo>;

export const ImageFileInfo = z.object({
  format: z.enum(["png", "webp", "jpeg", "other"]),
  width: z.number().nullable(),
  height: z.number().nullable(),
  summary: ImageSummary,
  settings: ImageSettings,
  a1111: z
    .object({
      positive: z.string(),
      negative: z.string(),
      settings: z.array(z.tuple([z.string(), z.string()])),
    })
    .nullable(),
  /** Nodes of the embedded ComfyUI prompt graph, for the "Graph" section. */
  comfy: z.array(ComfyNodeInfo).nullable(),
  /** The image carries a ComfyUI graph that "Import as workflow" can use. */
  hasWorkflow: z.boolean(),
  blombo: z
    .object({
      workflow: z.string().nullable(),
      name: z.string().nullable(),
      seed: z.number().nullable(),
    })
    .nullable(),
  /** Every text chunk with its size, so nothing in the file is hidden. */
  chunks: z.array(z.object({ key: z.string(), length: z.number(), text: z.string() })),
});
export type ImageFileInfo = z.infer<typeof ImageFileInfo>;

export const FileInfo = z.object({
  name: z.string(),
  size: z.number(),
  kind: z.enum(["image", "safetensors", "unknown"]),
  image: ImageFileInfo.nullable(),
  safetensors: SafetensorsInfo.nullable(),
  /** Where it came from when picked inside Blombo (gallery image id or model id). */
  origin: z.object({ type: z.enum(["gallery", "model"]), id: z.string() }).nullable(),
  error: z.string().nullable(),
});
export type FileInfo = z.infer<typeof FileInfo>;
