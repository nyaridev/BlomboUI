/** Streaming files to the browser without reading them into memory. */
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
};

/** Immutable: the URL carries a version, so the browser never asks again. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

export async function sendFile(
  file: string,
  opts: { cache?: string; type?: string; download?: string } = {},
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
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers });
}
