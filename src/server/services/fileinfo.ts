/**
 * File Info: readable sections for an image's embedded metadata (A1111 parameters, ComfyUI
 * prompt and workflow chunks, Blombo's own chunk) and a safetensors file's header. Works on
 * uploaded bytes and on files Blombo already knows (gallery images, local models). Read-only.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { ComfyNodeInfo, FileInfo, ImageFileInfo } from "../../shared/fileinfo.ts";
import { parseA1111 } from "../../shared/imageinfo.ts";
import { headerLength, parseSafetensorsHeader } from "../../shared/safetensors.ts";
import { isApiLink } from "../../shared/workflow/graph.ts";
import { type ImageHead, readImageHead, readImageHeadBytes } from "../lib/imagemeta.ts";
import { parseMeta, promptGraph } from "./gallery/meta.ts";
import { readSafetensorsHeader } from "./models.ts";

const CHUNK_PREVIEW = 4000;

function imageInfo(head: ImageHead): ImageFileInfo {
  const meta = parseMeta(head.text);
  const graph = promptGraph(head.text);
  const comfy: ComfyNodeInfo[] | null = graph
    ? Object.entries(graph)
        .sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b))
        .map(([id, node]) => ({
          id,
          type: node.class_type,
          title: node._meta?.title?.trim() || node.class_type,
          inputs: Object.entries(node.inputs ?? {}).filter(([, v]) => !isApiLink(v)),
        }))
    : null;
  const a1111 = head.text.parameters ? parseA1111(head.text.parameters) : null;
  return {
    format: head.format,
    width: head.width,
    height: head.height,
    summary: meta.summary,
    settings: meta.settings,
    a1111,
    comfy,
    hasWorkflow: meta.hasWorkflow,
    blombo: meta.blombo,
    chunks: Object.entries(head.text).map(([key, text]) => ({
      key,
      length: text.length,
      text: text.length > CHUNK_PREVIEW ? `${text.slice(0, CHUNK_PREVIEW)}…` : text,
    })),
  };
}

function base(name: string, size: number): FileInfo {
  return { name, size, kind: "unknown", image: null, safetensors: null, origin: null, error: null };
}

/** Inspect an uploaded file's bytes. */
export async function inspectBytes(bytes: Uint8Array, name: string): Promise<FileInfo> {
  const info = base(name, bytes.byteLength);
  if (/\.(safetensors|sft)$/i.test(name)) {
    info.kind = "safetensors";
    const n = headerLength(bytes.subarray(0, 8));
    if (n === null || 8 + n > bytes.byteLength) {
      info.error = "This doesn't look like a safetensors file (its header is missing or cut off).";
      return info;
    }
    try {
      info.safetensors = parseSafetensorsHeader(new TextDecoder().decode(bytes.subarray(8, 8 + n)));
    } catch {
      info.error = "The safetensors header isn't valid JSON.";
    }
    return info;
  }
  const head = await readImageHeadBytes(bytes);
  if (head.format === "other") {
    info.error = "File Info reads PNG, WebP and JPEG images and .safetensors models.";
    return info;
  }
  info.kind = "image";
  info.image = imageInfo(head);
  return info;
}

/** Inspect a file on disk that Blombo found itself (a gallery image or a local model). */
export async function inspectPath(
  file: string,
  origin: NonNullable<FileInfo["origin"]>,
): Promise<FileInfo> {
  const stat = await fs.stat(file);
  const info = { ...base(path.basename(file), stat.size), origin };
  if (/\.(safetensors|sft)$/i.test(file)) {
    info.kind = "safetensors";
    try {
      info.safetensors = await readSafetensorsHeader(file);
    } catch (error) {
      info.error = `Couldn't read the header: ${error instanceof Error ? error.message : error}`;
    }
    return info;
  }
  const head = await readImageHead(file);
  if (head.format === "other") {
    info.error = "This kind of file has no readable metadata.";
    return info;
  }
  info.kind = "image";
  info.image = imageInfo(head);
  return info;
}
