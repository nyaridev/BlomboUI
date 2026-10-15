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

export const CIVITAI_SORTS = ["Highest Rated", "Most Downloaded", "Newest"] as const;
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

/** Base models offered in the filter bar (Civitai's own names). */
export const CIVITAI_BASE_MODELS = [
  "Illustrious",
  "NoobAI",
  "Pony",
  "SDXL 1.0",
  "SD 1.5",
  "Flux.1 D",
  "Flux.1 S",
  "SD 3.5",
  "Anima",
  "Qwen",
  "Wan Video 2.2 T2V-A14B",
  "Other",
] as const;

/** Images at this Civitai NSFW level and above are blurred (1 PG, 2 PG-13, 4 R, 8 X, 16 XXX). */
export const NSFW_LEVEL = 4;

/* ── browsing ────────────────────────────────────────────────────────────── */

export const BrowseFilter = z.object({
  query: z.string().trim().max(200).default(""),
  types: z.array(z.string().max(40)).max(12).default([]),
  baseModels: z.array(z.string().max(60)).max(12).default([]),
  sort: z.enum(CIVITAI_SORTS).default("Highest Rated"),
  period: z.enum(CIVITAI_PERIODS).default("Month"),
  /** Include models marked NSFW (their images stay blurred until clicked). */
  nsfw: z.boolean().default(true),
  /** A creator's models only. */
  username: z.string().trim().max(60).default(""),
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
});
export type CivitaiImage = z.infer<typeof CivitaiImage>;

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
  q.set("nsfw", filter.nsfw ? "1" : "0");
  if (filter.username) q.set("user", filter.username);
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
    nsfw: params.nsfw === undefined ? undefined : params.nsfw === "1",
    username: params.user ?? "",
  });
  const cursor = params.cursor?.trim() ? params.cursor.trim().slice(0, 200) : null;
  return { filter, cursor };
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
