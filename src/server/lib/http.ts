/**
 * HTTP helpers: a typed error that routes throw, and Zod-validated body parsing.
 * The app-level onError turns HttpError into `{ error, code }` JSON.
 */
import fs from "node:fs/promises";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Feed a raw upload to `onChunk`, refused with 413 as soon as it passes `max` bytes (by its
 * Content-Length, or while it streams in), so an oversized body is never read to the end.
 */
async function streamBody(
  c: Context,
  max: number,
  tooLarge: string,
  onChunk: (chunk: Uint8Array) => unknown,
): Promise<number> {
  const declared = Number(c.req.header("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, tooLarge, "too_large");
  const body = c.req.raw.body;
  if (!body) return 0;
  let size = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new HttpError(413, tooLarge, "too_large");
      await onChunk(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return size;
}

/** A raw upload held in memory (small ones: images, lists), refused past `max` bytes. */
export async function readBody(c: Context, max: number, tooLarge: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const size = await streamBody(c, max, tooLarge, (chunk) => chunks.push(chunk));
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/**
 * A raw upload streamed into `file` (large ones: profile imports), refused past `max` bytes.
 * Returns its size. The file is the caller's to remove, also when this throws.
 */
export async function readBodyToFile(
  c: Context,
  file: string,
  max: number,
  tooLarge: string,
): Promise<number> {
  const out = await fs.open(file, "w");
  try {
    return await streamBody(c, max, tooLarge, (chunk) => out.write(chunk));
  } finally {
    await out.close();
  }
}

export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.", "bad_json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    throw new HttpError(400, `${where}${first?.message ?? "Invalid body"}`, "invalid_body", {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
