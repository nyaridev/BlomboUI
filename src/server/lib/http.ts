/**
 * HTTP helpers: a typed error that routes throw, and Zod-validated body parsing.
 * The app-level onError turns HttpError into `{ error, code }` JSON.
 */
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
 * A raw upload, refused with 413 as soon as it passes `max` bytes (by its Content-Length, or
 * while it streams in), so an oversized body is never held in memory whole.
 */
export async function readBody(c: Context, max: number, tooLarge: string): Promise<Uint8Array> {
  const declared = Number(c.req.header("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, tooLarge, "too_large");
  const body = c.req.raw.body;
  if (!body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, tooLarge, "too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
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
