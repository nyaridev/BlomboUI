/**
 * What the dev-only Saved data view shows (`/api/dev`, dev mode only): what a profile keeps on disk
 * (its folder and its database's tables) and the metadata inside one gallery image, so what the
 * app writes can be checked by eye.
 */
import { z } from "zod";

/** A file or folder in the profile folder; a collapsed folder (the trash) only counts its files. */
export const DevFile = z.object({
  path: z.string(),
  size: z.number(),
  dir: z.boolean(),
  /** Files inside a folder that's shown collapsed. */
  files: z.number().nullable(),
});
export type DevFile = z.infer<typeof DevFile>;

export const DevColumn = z.object({
  name: z.string(),
  type: z.string(),
  notNull: z.boolean(),
  /** Its place in the primary key (0: not in it). */
  pk: z.number(),
  default: z.string().nullable(),
});

export const DevTable = z.object({
  name: z.string(),
  kind: z.enum(["table", "virtual", "view"]),
  rows: z.number().nullable(),
  columns: z.array(DevColumn),
  indexes: z.array(z.string()),
  sql: z.string(),
});
export type DevTable = z.infer<typeof DevTable>;

export const DevStorage = z.object({
  profileId: z.string(),
  dir: z.string(),
  files: z.array(DevFile),
  /** Some files were left out (the list stops at a few hundred). */
  truncated: z.boolean(),
  db: z.object({
    file: z.string(),
    /** The migration the database is at, and the newest one this build has. */
    version: z.number(),
    latest: z.number(),
    tables: z.array(DevTable),
  }),
});
export type DevStorage = z.infer<typeof DevStorage>;

/** One metadata entry in a file (a PNG text chunk, an EXIF string, an MP4 comment…). */
export const DevChunk = z.object({
  key: z.string(),
  length: z.number(),
  text: z.string(),
  /** The text parsed, when it's JSON. */
  json: z.unknown(),
});
export type DevChunk = z.infer<typeof DevChunk>;

export const DevImageMeta = z.object({
  id: z.number(),
  path: z.string(),
  file: z.string(),
  format: z.string(),
  chunks: z.array(DevChunk),
  /** The `.civitai.json` sidecar beside a Civitai image. */
  sidecar: z.unknown(),
  /** What the gallery index made of it (the `summary` and `settings` columns). */
  index: z.object({ summary: z.unknown(), settings: z.unknown() }),
});
export type DevImageMeta = z.infer<typeof DevImageMeta>;
