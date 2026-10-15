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
