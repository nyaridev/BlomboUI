/**
 * The gallery: images from the profile's outputs folder and any extra library folders, indexed
 * into the profile's SQLite file (ADR-0006) with what they say about how they were made.
 * The index can be rebuilt from the files; favorites and the trash list survive a rebuild.
 */
import { z } from "zod";
import { ImageSettings, ImageSummary } from "./imageinfo.ts";
import { LibraryId } from "./settings.ts";

export const IMAGE_EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"] as const;

/** The outputs folder is always the first library. */
export const OUTPUTS_LIBRARY = "outputs";

/** One image in a gallery list: just enough to lay out and label a tile. */
export const GalleryImage = z.object({
  id: z.number().int(),
  library: z.string(),
  /** Path inside the library, with forward slashes. */
  path: z.string(),
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  size: z.number().int(),
  /** File modification time, ms since the epoch. */
  mtime: z.number(),
  favorite: z.boolean(),
  model: z.string().nullable(),
  /** Thumbnail URL; immutable (it changes when the file changes). */
  thumb: z.string(),
});
export type GalleryImage = z.infer<typeof GalleryImage>;

/** The lightbox's details: the tile plus the parsed metadata and "use these settings" data. */
export const ImageDetails = GalleryImage.extend({
  summary: ImageSummary,
  settings: ImageSettings,
  /** The image carries a ComfyUI workflow that can be imported. */
  hasWorkflow: z.boolean(),
  /** Full-size file URL. */
  file: z.string(),
});
export type ImageDetails = z.infer<typeof ImageDetails>;

export const GALLERY_SORTS = ["newest", "oldest", "name"] as const;

export const GalleryQuery = z.object({
  /** "all" or a library id. */
  library: z.string().default("all"),
  favorites: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  q: z.string().trim().max(200).default(""),
  model: z.string().max(400).optional(),
  lora: z.string().max(400).optional(),
  /** Only images modified at or after this time (ms). */
  since: z.coerce.number().optional(),
  sort: z.enum(GALLERY_SORTS).default("newest"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});
export type GalleryQuery = z.infer<typeof GalleryQuery>;
export type GalleryQueryInput = z.input<typeof GalleryQuery>;

export const GalleryPage = z.object({
  items: z.array(GalleryImage),
  total: z.number().int(),
  offset: z.number().int(),
});
export type GalleryPage = z.infer<typeof GalleryPage>;

export const LibraryInfo = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  /** The outputs folder (can't be removed here; change it in Settings). */
  builtin: z.boolean(),
  exists: z.boolean(),
  count: z.number().int(),
  cover: z.string().nullable(),
});
export type LibraryInfo = z.infer<typeof LibraryInfo>;

export const SyncState = z.object({
  running: z.boolean(),
  /** Files looked at and files found in the current pass. */
  done: z.number().int(),
  total: z.number().int(),
  added: z.number().int(),
  removed: z.number().int(),
  finishedAt: z.number().nullable(),
  error: z.string().nullable(),
});
export type SyncState = z.infer<typeof SyncState>;

export const GalleryOverview = z.object({
  libraries: z.array(LibraryInfo),
  counts: z.object({
    all: z.number().int(),
    favorites: z.number().int(),
    week: z.number().int(),
    trash: z.number().int(),
  }),
  /** A favorite for the showcase (or the newest image when there are no favorites). */
  featured: z.array(GalleryImage),
  /** Images per local day for the last 7 days, oldest first (today last). */
  perDay: z.array(z.number().int()),
  sync: SyncState,
  /** Search is full-text (FTS5) or a plain substring fallback. */
  search: z.enum(["fts", "like"]),
});
export type GalleryOverview = z.infer<typeof GalleryOverview>;

export const Facet = z.object({ name: z.string(), count: z.number().int() });
export const GalleryFacets = z.object({ models: z.array(Facet), loras: z.array(Facet) });
export type GalleryFacets = z.infer<typeof GalleryFacets>;

export const TrashEntry = z.object({
  id: z.string(),
  library: z.string(),
  /** Where it was, inside the library. */
  path: z.string(),
  name: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  size: z.number().int(),
  trashedAt: z.number(),
  thumb: z.string(),
});
export type TrashEntry = z.infer<typeof TrashEntry>;

export const FavoriteBody = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
  favorite: z.boolean(),
});
export const ImageIdsBody = z.object({ ids: z.array(z.number().int()).min(1).max(5000) });
export const TrashIdsBody = z.object({ ids: z.array(z.string()).min(1).max(5000) });

export const AddLibraryBody = z.object({
  name: z.string().trim().min(1).max(60),
  path: z.string().trim().min(1),
});
export type AddLibraryBody = z.infer<typeof AddLibraryBody>;

export const UpdateLibraryBody = z.object({
  id: LibraryId,
  name: z.string().trim().min(1).max(60),
});

/** A version tag for URLs that changes whenever the file does (size + mtime). */
function version(size: number, mtime: number): string {
  return `${size.toString(36)}-${Math.round(mtime).toString(36)}`;
}

/** Thumbnail URL of an indexed image; immutable, since it changes with the file. */
export function thumbUrl(id: number, size: number, mtime: number): string {
  return `/api/gallery/thumbs/${id}?v=${version(size, mtime)}`;
}

/** Full-size file URL of an indexed image. */
export function fileUrl(image: Pick<GalleryImage, "id" | "size" | "mtime">): string {
  return `/api/gallery/images/${image.id}/file?v=${version(image.size, image.mtime)}`;
}

/** Local calendar day of a timestamp (yyyy-mm-dd), for day sections. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
