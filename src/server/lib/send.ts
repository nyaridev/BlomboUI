/**
 * Streaming files to the browser without reading them into memory. A `range` (the request's
 * Range header) answers with just those bytes (206), which video and audio need to seek.
 */
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { HttpError } from "./http.ts";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

/** The bytes a "bytes=a-b" Range asks for, or null when it isn't one we answer. */
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    // The last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? { start, end } : null;
}

/** Immutable: the URL carries a version, so the browser never asks again. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

export async function sendFile(
  file: string,
  opts: { cache?: string; type?: string; download?: string; range?: string | null } = {},
): Promise<Response> {
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    throw new HttpError(404, "That file isn't there anymore.", "file_missing");
  }
  const headers: Record<string, string> = {
    "content-type":
      opts.type ?? TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": String(size),
    "cache-control": opts.cache ?? "no-cache",
  };
  if (opts.download)
    headers["content-disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(opts.download)}`;
  headers["accept-ranges"] = "bytes";
  const range = opts.range ? byteRange(opts.range, size) : null;
  if (opts.range && !range)
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  if (range) {
    headers["content-length"] = String(range.end - range.start + 1);
    headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
  }
  const stream = Readable.toWeb(
    createReadStream(file, range ?? undefined),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}
