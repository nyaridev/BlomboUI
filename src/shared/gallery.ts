/**
 * The gallery: images from the profile's outputs folder and any extra library folders, indexed
 * into the profile's SQLite file (ADR-0006) with what they say about how they were made.
 * The index can be rebuilt from the files; favorites and the trash list survive a rebuild.
 */
import { z } from "zod";
import { ImageSettings, ImageSummary } from "./imageinfo.ts";
import { slugId } from "./settings.ts";

export const IMAGE_EXTENSIONS = [".png", ".webp", ".jpg", ".jpeg"] as const;
export const VIDEO_EXTENSIONS = [".mp4"] as const;
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg"] as const;
/** Everything the gallery indexes: images (GIFs too), videos and audio. */
export const GALLERY_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ".gif",
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
] as const;

/** What a gallery file is: a still image, an animated WebP or GIF, a video or audio. */
export const MEDIA_KINDS = ["image", "animated", "video", "audio"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** A file's kind by its extension (a GIF or WebP is "image" until its frames are counted). */
export function mediaOf(name: string): MediaKind {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext)
    ? "video"
    : (AUDIO_EXTENSIONS as readonly string[]).includes(ext)
      ? "audio"
      : "image";
}

/** The outputs folder is always the first library. */
export const OUTPUTS_LIBRARY = "outputs";

/**
 * Where an image came from: made here (or by any tool) and saved in an output folder, added from
 * your PC, or added from Civitai. Imports land in these folders at the top of the main output
 * folder, so the origin is read from the path.
 */
export const IMAGE_ORIGINS = ["generated", "imported", "civitai"] as const;
export type ImageOrigin = (typeof IMAGE_ORIGINS)[number];
export const IMPORT_FOLDERS = { imported: "imported", civitai: "civitai" } as const;

/**
 * Where Blombo saves what it makes, inside the main output folder:
 * `<workflow>/<type>/<yyyy-mm-dd>/<file>`, e.g. `illustrious/images/2026-11-01/blombo_00001_.png`.
 * Types: a run's images, a script's grids, and the images of a run that was stopped (moved there
 * once it stops).
 */
export const OUTPUT_TYPES = ["images", "grids", "interrupted"] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];
/** The file name ComfyUI numbers (`blombo_00001_.png`). */
export const OUTPUT_STEM = "blombo";

/**
 * A workflow's folder in the outputs: its name as a slug ("Illustrious XL" → "illustrious-xl").
 * Names the import and type folders use get "-workflow", so the gallery never mistakes them.
 */
export function workflowFolder(name: string, id: string): string {
  const slug = slugId(name, slugId(id, "workflow"));
  const taken = [...Object.values(IMPORT_FOLDERS), ...OUTPUT_TYPES] as string[];
  return taken.includes(slug) ? `${slug}-workflow` : slug;
}

/** ComfyUI's `filename_prefix` for a type of output (its date tokens make the day folder). */
export function outputPrefix(folder: string, type: OutputType): string {
  return `${folder}/${type}/%year%-%month%-%day%/${OUTPUT_STEM}`;
}

/**
 * Where a stopped run's image moves: `<workflow>/images/<day>` becomes `<workflow>/interrupted/
 * <day>`. Null for a folder in another layout (older days, a prefix set in the graph).
 */
export function interruptedFolder(subfolder: string): string | null {
  const parts = subfolder.replace(/\\/g, "/").split("/");
  return parts.length === 3 && parts[1] === "images" && parts[0] && parts[2]
    ? [parts[0], "interrupted", parts[2]].join("/")
    : null;
}

/** An image's origin from its path inside its library ("civitai/abc.jpeg"). */
export function originOf(rel: string): ImageOrigin {
  const top = rel.split("/")[0]?.toLowerCase();
  return rel.includes("/") && top === IMPORT_FOLDERS.civitai
    ? "civitai"
    : rel.includes("/") && top === IMPORT_FOLDERS.imported
      ? "imported"
      : "generated";
}

/** Saved next to an image added from Civitai (`<image>.civitai.json`): what Civitai says about it. */
export const CIVITAI_SIDECAR = ".civitai.json";
export const CivitaiSidecar = z.object({
  format: z.literal("blombo.civitai-image/1").default("blombo.civitai-image/1"),
  /** Civitai's image id, when the answer had one. */
  imageId: z.number().int().nullable().default(null),
  /** The id in the image's address (the same on every size of it). */
  key: z.string().default(""),
  /** Where the original file was downloaded from. */
  url: z.string().default(""),
  /** The site it was added from (civitai.com or civitai.red). */
  site: z.string().default(""),
  postId: z.number().int().nullable().default(null),
  /** Who posted it. */
  by: z.string().nullable().default(null),
  /** The model version whose page it was added from (0: not known). */
  versionId: z.number().int().default(0),
  /** Every model version Civitai says made it (checkpoint, LoRAs, embeddings), that one included. */
  versions: z.array(z.number().int()).default([]),
  /** How it was made, as the poster shared it (Civitai's own keys). */
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
  /** Model names by version id, for `versions` (a graph from Civitai's generator names only ids). */
  names: z.record(z.string(), z.string()).default({}),
  addedAt: z.number().default(0),
});
export type CivitaiSidecar = z.infer<typeof CivitaiSidecar>;

/** Add a Civitai image to the gallery: the version it's shown for and the image's ids. */
export const AddCivitaiImageBody = z.object({
  versionId: z.number().int().positive(),
  key: z.string().regex(/^[\w-]{1,80}$/),
  id: z.number().int().positive().nullable().default(null),
});
export type AddCivitaiImageBody = z.input<typeof AddCivitaiImageBody>;

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
  /** Your stars, 0 (none) to 5. */
  rating: z.number().int().min(0).max(5).default(0),
  model: z.string().nullable(),
  /** Thumbnail URL; immutable (it changes when the file changes). */
  thumb: z.string(),
  origin: z.enum(IMAGE_ORIGINS).default("generated"),
  media: z.enum(MEDIA_KINDS).default("image"),
  /** Length in seconds (videos, audio, animations), when the file says. */
  duration: z.number().nullable().default(null),
});
export type GalleryImage = z.infer<typeof GalleryImage>;

/** An image added to the gallery; `already` when it was there before. */
export const AddedImage = z.object({ image: GalleryImage, already: z.boolean() });
export type AddedImage = z.infer<typeof AddedImage>;

/** The lightbox's details: the tile plus the parsed metadata and "use these settings" data. */
export const ImageDetails = GalleryImage.extend({
  summary: ImageSummary,
  settings: ImageSettings,
  /** The image carries a ComfyUI workflow that can be imported. */
  hasWorkflow: z.boolean(),
  /** Full-size file URL. */
  file: z.string(),
  /** Your own tags. */
  tags: z.array(z.string()).default([]),
  /** Ids of the collections it's in. */
  collections: z.array(z.string()).default([]),
  /** Added from Civitai: who posted it and where it's on the site. */
  civitai: z
    .object({ by: z.string().nullable(), page: z.string().nullable(), versionId: z.number() })
    .nullable()
    .default(null),
});
export type ImageDetails = z.infer<typeof ImageDetails>;

/** `random`: a shuffle, the same order for the same `seed` (so pages don't repeat images). */
export const GALLERY_SORTS = ["newest", "oldest", "name", "rating", "random"] as const;

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
  /** Only images with at least this many stars. */
  rating: z.coerce.number().int().min(0).max(5).default(0),
  /** Only images with this tag of yours. */
  tag: z.string().max(60).optional(),
  /** Only images in this collection. */
  collection: z.string().max(60).optional(),
  /** Which origins to show, comma-separated ("generated,civitai"); all of them by default. */
  origins: z
    .string()
    .max(80)
    .default(IMAGE_ORIGINS.join(","))
    .transform((v) => IMAGE_ORIGINS.filter((o) => v.split(",").includes(o))),
  sort: z.enum(GALLERY_SORTS).default("newest"),
  /** The shuffle's order (sort `random`). */
  seed: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
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
    /** Added from your PC, and from Civitai. */
    imported: z.number().int().default(0),
    civitai: z.number().int().default(0),
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

/** What the gallery's Most used views list (and Home shows a row of each). */
export const USE_KINDS = ["models", "loras", "wildcards", "tags"] as const;
export type UseKind = (typeof USE_KINDS)[number];

/**
 * A model, LoRA or wildcard the job log says you used, or a tag you prompt with, for the
 * gallery's Home and Most used views.
 */
export const HomeUse = z.object({
  name: z.string(),
  /**
   * Finished runs that used it, ever and in the last `HOME_RECENT_DAYS` (a tag: the prompts
   * you ran with it, and 0).
   */
  count: z.number().int(),
  recent: z.number().int(),
  /**
   * How many images it has: in the gallery for a model, LoRA or tag; generated by the runs
   * that used it for a wildcard.
   */
  total: z.number().int(),
  /** Thumbnail URLs of the newest images made with it, newest first (may be empty). */
  images: z.array(z.string()),
  /**
   * Its name for the image list's model or LoRA filter, when the gallery has images with it; a
   * tag's search text. Null for a wildcard.
   */
  filter: z.string().nullable(),
});
export type HomeUse = z.infer<typeof HomeUse>;

export const HOME_RECENT_DAYS = 14;

/** A Most used view: the kind's most used first. */
export const GalleryUsesQuery = z.object({
  kind: z.enum(USE_KINDS),
  /** Which random images the cards show; a refetch with the same seed keeps them. */
  seed: GalleryQuery.shape.seed,
});

/** The carousel's order comes from `seed`, so a refetch (a new image, a heart) keeps it. */
export const GalleryHomeQuery = z.object({
  seed: GalleryQuery.shape.seed,
});

/**
 * The gallery's Home: a random handful of recent images and what you've been prompting with
 * (tags from the prompts you ran, models, LoRAs and wildcards from the job log, what you used
 * lately first), each with its newest images.
 */
export const GalleryHome = z.object({
  picks: z.array(GalleryImage),
  tags: z.object({ top: z.array(HomeUse), lately: z.array(HomeUse) }),
  models: z.array(HomeUse),
  loras: z.array(HomeUse),
  wildcards: z.array(HomeUse),
});
export type GalleryHome = z.infer<typeof GalleryHome>;

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

/** One of your tags: trimmed, lowercase, no commas. */
export const ImageTag = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform((t) => t.toLowerCase().replace(/\s+/g, " "))
  .refine((t) => !t.includes(","), "Tags can't contain commas");

export const RatingBody = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
  rating: z.number().int().min(0).max(5),
});
export const TagsBody = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
  add: z.array(ImageTag).max(20).default([]),
  remove: z.array(ImageTag).max(20).default([]),
});
export const TagCount = z.object({ tag: z.string(), count: z.number().int() });
export type TagCount = z.infer<typeof TagCount>;

/** A virtual album: images from any library, kept by library + path. */
export const Collection = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().int(),
  cover: z.string().nullable(),
  createdAt: z.number(),
});
export type Collection = z.infer<typeof Collection>;
export const CollectionName = z.object({ name: z.string().trim().min(1).max(60) });
export const CollectionItemsBody = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
  remove: z.boolean().default(false),
});

export const FavoriteBody = z.object({
  ids: z.array(z.number().int()).min(1).max(5000),
  favorite: z.boolean(),
});
export const ImageIdsBody = z.object({ ids: z.array(z.number().int()).min(1).max(5000) });
export const TrashIdsBody = z.object({ ids: z.array(z.string()).min(1).max(5000) });
/** Empty the trash: these entries, or all of it without `ids`. */
export const EmptyTrashBody = z.object({ ids: z.array(z.string()).max(5000).optional() });

const LibraryName = z.string().trim().min(1).max(60);
export const AddLibraryBody = z.object({
  name: LibraryName,
  path: z.string().trim().min(1),
});
export type AddLibraryBody = z.infer<typeof AddLibraryBody>;

export const RenameLibraryBody = z.object({ name: LibraryName });

/** A version tag for URLs that changes whenever the file does (size + mtime). */
function version(size: number, mtime: number): string {
  return `${size.toString(36)}-${Math.round(mtime).toString(36)}`;
}

/** Thumbnail URL of an indexed image; immutable, since it changes with the file. */
export function thumbUrl(id: number, size: number, mtime: number): string {
  return `/api/gallery/thumbs/${id}?v=${version(size, mtime)}`;
}

/** An animated image's moving thumbnail (the plain one is its first frame). */
export function animatedThumbUrl(image: Pick<GalleryImage, "thumb">): string {
  return `${image.thumb}&anim=1`;
}

/** A length as a player shows it: "0:03", "1:24", "1:02:05". */
export function playTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
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
