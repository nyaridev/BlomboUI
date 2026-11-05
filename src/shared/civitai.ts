/**
 * Civitai, as Blombo shows it. The server talks to Civitai (with the profile's API key, caching
 * responses and images) and hands the client these normalized shapes; the client never calls
 * Civitai itself. Image URLs here always point at Blombo's image proxy.
 */
import { z } from "zod";
import { MODEL_KINDS, type ModelKind } from "./constants.ts";
import { RichBlock } from "./richtext.ts";

/** Civitai model types Blombo knows how to show, with the folder each downloads into. */
export const CIVITAI_TYPES = [
  "Checkpoint",
  "LORA",
  "LoCon",
  "DoRA",
  "TextualInversion",
  "VAE",
  "Controlnet",
  "Upscaler",
  "Detection",
  "Hypernetwork",
  "MotionModule",
  "Other",
] as const;
export type CivitaiType = (typeof CIVITAI_TYPES)[number];

export const CIVITAI_TYPE_LABELS: Record<string, string> = {
  Checkpoint: "Checkpoint",
  LORA: "LoRA",
  LoCon: "LyCORIS",
  DoRA: "DoRA",
  TextualInversion: "Embedding",
  VAE: "VAE",
  Controlnet: "ControlNet",
  Upscaler: "Upscaler",
  Detection: "Detector",
  Hypernetwork: "Hypernetwork",
  MotionModule: "Motion",
  Other: "Other",
};

/** Types offered in the browser's filter bar, most used first. */
export const CIVITAI_FILTER_TYPES: CivitaiType[] = [
  "Checkpoint",
  "LORA",
  "LoCon",
  "TextualInversion",
  "VAE",
  "Controlnet",
  "Upscaler",
  "Detection",
];

const TYPE_KINDS: Partial<Record<string, ModelKind>> = {
  Checkpoint: "checkpoints",
  LORA: "loras",
  LoCon: "loras",
  DoRA: "loras",
  TextualInversion: "embeddings",
  VAE: "vae",
  Controlnet: "controlnet",
  Upscaler: "upscale_models",
  Detection: "ultralytics",
};

/** The models folder a Civitai type downloads into, or null when Blombo can't place it. */
export function civitaiKind(type: string): ModelKind | null {
  return TYPE_KINDS[type] ?? null;
}

/** Civitai's own model sorts, as its site lists them. */
export const CIVITAI_SORTS = [
  "Highest Rated",
  "Most Downloaded",
  "Most Liked",
  "Most Discussed",
  "Most Collected",
  "Most Images",
  "Newest",
  "Oldest",
] as const;
export type CivitaiSort = (typeof CIVITAI_SORTS)[number];

export const CIVITAI_PERIODS = ["AllTime", "Year", "Month", "Week", "Day"] as const;
export type CivitaiPeriod = (typeof CIVITAI_PERIODS)[number];

export const CIVITAI_PERIOD_LABELS: Record<CivitaiPeriod, string> = {
  AllTime: "All time",
  Year: "Year",
  Month: "Month",
  Week: "Week",
  Day: "Today",
};

/**
 * Civitai's model categories, as its site's filter row lists them (the API's `tag`; one at a time).
 */
export const CIVITAI_CATEGORIES = [
  "character",
  "style",
  "celebrity",
  "concept",
  "clothing",
  "base model",
  "poses",
  "background",
  "tool",
  "buildings",
  "vehicle",
  "objects",
  "animal",
  "action",
  "assets",
] as const;

/** "base model" → "Base model". */
export const categoryLabel = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1);

/** Images at this Civitai NSFW level and above are blurred (1 PG, 2 PG-13, 4 R, 8 X, 16 XXX). */
export const NSFW_LEVEL = 4;

/**
 * Civitai's two sites (split in April 2026): civitai.com shows SFW models only, civitai.red
 * has everything. Same API on both; the profile picks one (`settings.civitai.site`).
 */
export const CIVITAI_SITES = ["com", "red"] as const;
export type CivitaiSite = (typeof CIVITAI_SITES)[number];
export const CIVITAI_SITE_URLS: Record<CivitaiSite, string> = {
  com: "https://civitai.com",
  red: "https://civitai.red",
};

/* ── browsing ────────────────────────────────────────────────────────────── */

/** A day as Civitai's date filter takes it (UTC). */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DayOrNone = z.string().regex(ISO_DAY).or(z.literal("")).default("");

/** The longest published-date range Civitai searches, counting both days. */
export const DATE_RANGE_DAYS = 31;
const DAY_MS = 24 * 3600_000;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** What's wrong with a published-date range, or null when it's fine (or not set). */
export function dateRangeProblem(from: string, to: string): string | null {
  if (!from && !to) return null;
  if (!from || !to) return "Pick both dates: Civitai searches a range with a start and an end.";
  if (Number.isNaN(dayMs(from)) || Number.isNaN(dayMs(to))) return "That isn't a date.";
  if (dayMs(from) > dayMs(to)) return "The start date is after the end date.";
  if (dayMs(to) - dayMs(from) > (DATE_RANGE_DAYS - 1) * DAY_MS)
    return `Civitai searches ${DATE_RANGE_DAYS} days at most. Pick a shorter range.`;
  return null;
}

export const BrowseFilter = z.object({
  query: z.string().trim().max(200).default(""),
  types: z.array(z.string().max(40)).max(12).default([]),
  baseModels: z.array(z.string().max(60)).max(12).default([]),
  sort: z.enum(CIVITAI_SORTS).default("Highest Rated"),
  period: z.enum(CIVITAI_PERIODS).default("AllTime"),
  /** A creator's models only. */
  username: z.string().trim().max(60).default(""),
  /** One of Civitai's categories (or any tag); "" for all. */
  tag: z.string().trim().max(40).default(""),
  /**
   * Published between these days (both counted; both or neither, DATE_RANGE_DAYS at most). Set,
   * the search goes through Civitai's own site search with the API key: the public API has no
   * date filter.
   */
  publishedFrom: DayOrNone,
  publishedTo: DayOrNone,
});
export type BrowseFilter = z.infer<typeof BrowseFilter>;
export type BrowseFilterInput = z.input<typeof BrowseFilter>;

export const SavedFilter = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  name: z.string().trim().min(1).max(60),
  filter: BrowseFilter,
});
export type SavedFilter = z.infer<typeof SavedFilter>;

/** One image, through Blombo's proxy. */
/** How a Civitai sample image was made, as its poster shared it (File Info shows it). */
export const CivitaiImageMeta = z.object({
  prompt: z.string().nullable(),
  negative: z.string().nullable(),
  /** Label → value, in a fixed order (Model, Steps, CFG, Sampler…). */
  settings: z.array(z.tuple([z.string(), z.string()])),
});
export type CivitaiImageMeta = z.infer<typeof CivitaiImageMeta>;

export const CivitaiImage = z.object({
  /** Card-sized (450 px wide). */
  thumb: z.string(),
  /** Large (1280 px wide) for the carousel. */
  full: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  nsfw: z.boolean(),
  /** A video on Civitai; Blombo shows its first frame. */
  video: z.boolean(),
  /** Who posted it, when Civitai says (images saved before this have none). */
  by: z.string().nullable().default(null),
  meta: CivitaiImageMeta.nullable().default(null),
});
export type CivitaiImage = z.infer<typeof CivitaiImage>;

/** A page of images people posted with a version (the model page's community grid). */
export const CivitaiImagePage = z.object({
  items: z.array(CivitaiImage),
  /** Civitai's cursor for the next page; null at the end. */
  nextCursor: z.string().nullable(),
});
export type CivitaiImagePage = z.infer<typeof CivitaiImagePage>;

/** Civitai's orders for the images people post. */
export const IMAGE_SORTS = ["Most Reactions", "Most Comments", "Newest"] as const;
export type ImageSort = (typeof IMAGE_SORTS)[number];

/** A request for a page of community images: the order, the period, and where to go on. */
export const CommunityQuery = z.object({
  sort: z.enum(IMAGE_SORTS).default("Most Reactions"),
  period: z.enum(CIVITAI_PERIODS).default("AllTime"),
  /** Civitai's cursor ("feed:1231:86032226"); none for the first page. */
  cursor: z
    .string()
    .regex(/^[\w:.-]{1,200}$/)
    .optional(),
});
export type CommunityQuery = z.infer<typeof CommunityQuery>;

/** What's already in the models folder from this Civitai model. */
export const LocalMark = z.object({
  /** Version ids found locally (by their info files or by hash). */
  versions: z.array(z.number()),
  /** The newest version is among them. */
  latest: z.boolean(),
});
export type LocalMark = z.infer<typeof LocalMark>;

export const CivitaiCard = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  kind: z.enum(MODEL_KINDS).nullable(),
  creator: z.string().nullable(),
  nsfw: z.boolean(),
  baseModel: z.string().nullable(),
  downloads: z.number(),
  likes: z.number(),
  image: CivitaiImage.nullable(),
  /** Newest version id. */
  versionId: z.number().nullable(),
  /** When the newest version came out (ISO), for the Following feed's order. */
  publishedAt: z.string().nullable().default(null),
  local: LocalMark.nullable(),
});
export type CivitaiCard = z.infer<typeof CivitaiCard>;

export const CivitaiPage = z.object({
  items: z.array(CivitaiCard),
  nextCursor: z.string().nullable(),
});
export type CivitaiPage = z.infer<typeof CivitaiPage>;

export const CivitaiFile = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number().nullable(),
  /** "Model", "Pruned Model", "VAE", "Training Data"… */
  type: z.string(),
  format: z.string().nullable(),
  fp: z.string().nullable(),
  primary: z.boolean(),
  /** Pickle and virus scans passed (null while Civitai hasn't scanned it). */
  safe: z.boolean().nullable(),
  sha256: z.string().nullable(),
});
export type CivitaiFile = z.infer<typeof CivitaiFile>;

export const CivitaiVersion = z.object({
  id: z.number(),
  name: z.string(),
  baseModel: z.string().nullable(),
  publishedAt: z.string().nullable(),
  trainedWords: z.array(z.string()),
  description: z.array(RichBlock),
  downloads: z.number(),
  files: z.array(CivitaiFile),
  images: z.array(CivitaiImage),
  /** Only people with access can download it yet. */
  earlyAccess: z.boolean(),
});
export type CivitaiVersion = z.infer<typeof CivitaiVersion>;

export const CivitaiModel = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  kind: z.enum(MODEL_KINDS).nullable(),
  creator: z.string().nullable(),
  creatorImage: z.string().nullable(),
  tags: z.array(z.string()),
  nsfw: z.boolean(),
  downloads: z.number(),
  likes: z.number(),
  description: z.array(RichBlock),
  versions: z.array(CivitaiVersion),
  /** The model's page on civitai.com (opened in the system browser). */
  url: z.string(),
  local: LocalMark.nullable(),
});
export type CivitaiModel = z.infer<typeof CivitaiModel>;

/* ── account ─────────────────────────────────────────────────────────────── */

export const CivitaiAccount = z.object({
  /** An API key is saved for this profile. The key itself never leaves the server. */
  keySet: z.boolean(),
  /** The last four characters, to tell keys apart. */
  keyHint: z.string().nullable(),
  username: z.string().nullable(),
  checkedAt: z.string().nullable(),
});
export type CivitaiAccount = z.infer<typeof CivitaiAccount>;

export const SetCivitaiKeyBody = z.object({
  key: z
    .string()
    .trim()
    .min(8, "That's too short for a Civitai API key.")
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, "A Civitai API key has only letters and numbers."),
  /** Check the key with Civitai before saving (on by default). */
  check: z.boolean().default(true),
});
export type SetCivitaiKeyBody = z.input<typeof SetCivitaiKeyBody>;

/** The Civitai model a file belongs to (found by its hash), and which version the file is. */
export const CivitaiMatch = z.object({ model: CivitaiModel, versionId: z.number() }).nullable();
export type CivitaiMatch = z.infer<typeof CivitaiMatch>;

/* ── history ─────────────────────────────────────────────────────────────── */

export const CivitaiView = z.object({
  modelId: z.number(),
  name: z.string(),
  type: z.string(),
  creator: z.string().nullable(),
  image: CivitaiImage.nullable(),
  viewedAt: z.number(),
});
export type CivitaiView = z.infer<typeof CivitaiView>;

export const CivitaiSearch = z.object({ query: z.string(), at: z.number() });

/** The base models Civitai's filter offers now (its ActiveBaseModel list). */
export const CivitaiBaseModels = z.object({
  names: z.array(z.string()),
  /** False: Civitai couldn't be asked, so this is Blombo's built-in list. */
  fromCivitai: z.boolean(),
});
export type CivitaiBaseModels = z.infer<typeof CivitaiBaseModels>;
export type CivitaiSearch = z.infer<typeof CivitaiSearch>;

/* ── the browse request ──────────────────────────────────────────────────── */

/** A filter (and the next page's cursor) as /api/civitai/models query text. */
export function browseQuery(filter: BrowseFilter, cursor?: string | null): string {
  const q = new URLSearchParams();
  if (filter.query) q.set("q", filter.query);
  if (filter.types.length) q.set("types", filter.types.join(","));
  if (filter.baseModels.length) q.set("base", filter.baseModels.join(","));
  q.set("sort", filter.sort);
  q.set("period", filter.period);
  if (filter.username) q.set("user", filter.username);
  if (filter.tag) q.set("tag", filter.tag);
  if (filter.publishedFrom) q.set("from", filter.publishedFrom);
  if (filter.publishedTo) q.set("to", filter.publishedTo);
  if (cursor) q.set("cursor", cursor);
  return q.toString();
}

/** The other way around (the server's route). Throws a ZodError for bad values. */
export function parseBrowseQuery(params: Record<string, string | undefined>): {
  filter: BrowseFilter;
  cursor: string | null;
} {
  const list = (v: string | undefined) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const filter = BrowseFilter.parse({
    query: params.q ?? "",
    types: list(params.types),
    baseModels: list(params.base),
    sort: params.sort || undefined,
    period: params.period || undefined,
    username: params.user ?? "",
    tag: params.tag ?? "",
    publishedFrom: params.from ?? "",
    publishedTo: params.to ?? "",
  });
  // The site search's cursors are longer (an encoded value and its type).
  const cursor = params.cursor?.trim() ? params.cursor.trim().slice(0, 1000) : null;
  return { filter, cursor };
}

/** A Civitai username as Blombo keeps it (Following; Civitai's names are letters, digits, _ - .). */
export const CivitaiUsername = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\w.-]+$/, "A Civitai username has only letters, digits, _, - and dots.");

/**
 * A creator as Civitai spells their name, with their picture: a URL of Blombo's image proxy
 * (which keeps the file on disk), null while unknown or when they have none.
 */
export const CivitaiCreator = z.object({
  username: CivitaiUsername,
  image: z
    .string()
    .max(4000)
    .regex(/^\/api\/civitai\/image\?u=[\w-]+$/, "Only Blombo's image proxy.")
    .nullable()
    .default(null),
});
export type CivitaiCreator = z.infer<typeof CivitaiCreator>;

/** A followed creator (`settings.civitai.following`); a plain name (saved before pictures were kept) reads as one without a picture. */
export const FollowedCreator = z.union([
  CivitaiCreator,
  CivitaiUsername.transform((username): CivitaiCreator => ({ username, image: null })),
]);

/** Most creators the Following feed asks about at once. */
export const FEED_MAX_USERS = 100;

/** The Following feed's request: whose models, with the filter (its creator is ignored). */
export function feedQuery(users: string[], filter: BrowseFilter): string {
  const q = new URLSearchParams(browseQuery({ ...filter, username: "" }));
  q.set("users", users.join(","));
  return q.toString();
}

/** The feed's creators from its query text (bad names are skipped). */
export function parseFeedUsers(text: string | undefined): string[] {
  const out: string[] = [];
  for (const u of (text ?? "").split(",")) {
    const ok = CivitaiUsername.safeParse(u);
    if (ok.success && !out.includes(ok.data)) out.push(ok.data);
  }
  return out.slice(0, FEED_MAX_USERS);
}

/** Feed cards from several creators' pages: one of each model, newest first. */
export function mergeFeed(
  pages: CivitaiCard[][],
  sort: CivitaiSort = "Newest",
  /** For the sorts by a number (downloads, likes, comments…): the model's, higher first. */
  score: (c: CivitaiCard) => number = () => 0,
): CivitaiCard[] {
  const seen = new Map<number, CivitaiCard>();
  for (const page of pages) for (const c of page) if (!seen.has(c.id)) seen.set(c.id, c);
  const newest = (a: CivitaiCard, b: CivitaiCard) =>
    (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  return [...seen.values()].sort(
    sort === "Newest"
      ? newest
      : sort === "Oldest"
        ? (a, b) => newest(b, a)
        : (a, b) => score(b) - score(a) || newest(a, b),
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/**
 * A resized variant of a Civitai image URL. Their CDN takes transforms as one path segment before
 * the file name (".../<uuid>/width=450/123.jpeg"); `original=true` asks for the full file.
 * Videos get their first frame as a still JPEG, so nothing animated is ever downloaded.
 */
export function civitaiImageVariant(url: string, width: number, video: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const parts = parsed.pathname.split("/");
  const file = parts.pop() ?? "";
  const transform = video
    ? `anim=false,transcode=true,width=${width},optimized=true`
    : `width=${width}`;
  const prev = parts[parts.length - 1] ?? "";
  if (prev.includes("=")) parts[parts.length - 1] = transform;
  else parts.push(transform);
  const name = video ? file.replace(/\.[a-z0-9]+$/i, ".jpeg") : file;
  parsed.pathname = [...parts, name].join("/");
  return parsed.href;
}

/** The size of an image's `full` picture: Civitai's is at most 1280 px wide (never upscaled). */
export function civitaiFullSize(img: { width: number | null; height: number | null }): {
  width?: number;
  height?: number;
} {
  if (!img.width || !img.height) return {};
  const width = Math.min(img.width, 1280);
  return { width, height: Math.round((img.height * width) / img.width) };
}

/** Blombo's image proxy URL for an (allowed) remote image. */
export function proxiedImage(url: string): string {
  return `/api/civitai/image?u=${base64Url(url)}`;
}

export function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): string | null {
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** "1234567" → "1.2M", "12400" → "12.4k". */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return String(n);
}
