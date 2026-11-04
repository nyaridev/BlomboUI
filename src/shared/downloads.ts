/**
 * Downloads: model files fetched by the server into the profile's models folder, from Civitai or
 * the ComfyUI model catalog (Models → Manager). The queue lives on the server (it survives a
 * reload, every window sees it, progress comes over the live bus) and every download is also a
 * row in the profile's history.
 *
 * Where a Civitai file lands is decided here, as pure functions the server and the download
 * dialog's preview share: <kind folder>/<sorted subfolders>/<file name>.
 */
import { z } from "zod";
import { MODEL_KINDS, type ModelKind } from "./constants.ts";
import { MODEL_FOLDERS } from "./models.ts";
import type { CivitaiSettings, DownloadFolderPart, DownloadNaming } from "./settings.ts";

export const DOWNLOAD_STATES = [
  "queued",
  "running",
  "paused",
  "done",
  "error",
  "cancelled",
] as const;
export const DownloadState = z.enum(DOWNLOAD_STATES);
export type DownloadState = z.infer<typeof DownloadState>;

export const DOWNLOAD_SOURCES = ["civitai", "manager"] as const;
export const DownloadSource = z.enum(DOWNLOAD_SOURCES);
export type DownloadSource = z.infer<typeof DownloadSource>;

export const Download = z.object({
  id: z.string(),
  source: DownloadSource,
  /** What people call it ("Detail Tweaker · v2"). */
  name: z.string(),
  /** Path inside the models root, with forward slashes ("loras/Illustrious/foo.safetensors"). */
  dest: z.string(),
  kind: z.enum(MODEL_KINDS).nullable(),
  /** Expected size in bytes, when known. */
  size: z.number().nullable(),
  received: z.number(),
  state: DownloadState,
  /** What went wrong and what to do; set when state is "error". */
  error: z.string().nullable(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  modelId: z.number().nullable(),
  versionId: z.number().nullable(),
  /** Catalog entry for Manager installs. */
  entryId: z.string().nullable(),
  /** Card image (through the image proxy). */
  thumb: z.string().nullable(),
});
export type Download = z.infer<typeof Download>;

export const DownloadProgress = z.object({
  id: z.string(),
  received: z.number(),
  size: z.number().nullable(),
  /** Bytes per second over the last few seconds. */
  speed: z.number(),
});
export type DownloadProgress = z.infer<typeof DownloadProgress>;

export const DownloadsSnapshot = z.object({
  /** Running, queued and paused first (in run order), then this session's finished ones. */
  items: z.array(Download),
  parallel: z.number().int(),
});
export type DownloadsSnapshot = z.infer<typeof DownloadsSnapshot>;

export const DownloadHistoryPage = z.object({
  items: z.array(Download),
  total: z.number().int(),
});
export type DownloadHistoryPage = z.infer<typeof DownloadHistoryPage>;

/** Folder names: no characters Windows refuses, no dots or spaces at the ends. */
const FolderPath = z
  .string()
  .trim()
  .max(240)
  .refine(
    (s) =>
      s.split("/").every((p) => p === "" || (p !== "." && p !== ".." && !/[\\:*?"<>|]/.test(p))),
    'Use a folder without \\ : * ? " < > | or ..',
  );

export const EnqueueBody = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("civitai"),
    modelId: z.number().int().positive(),
    versionId: z.number().int().positive(),
    /** A file of that version; its primary file when left out. */
    fileId: z.number().int().positive().optional(),
    /** Override the kind folder (a Civitai "Checkpoint" that is really a diffusion model). */
    kind: z.enum(MODEL_KINDS).optional(),
    /** Override the sorted subfolder (inside the kind folder; "" = the kind folder itself). */
    folder: FolderPath.optional(),
    /** Override the file name (without its extension, which stays the file's own). */
    name: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({ source: z.literal("manager"), entryId: z.string().min(1).max(80) }),
]);
export type EnqueueBody = z.infer<typeof EnqueueBody>;

/** Where a download would go, shown before it starts. */
export const DownloadPlan = z.object({
  name: z.string(),
  kind: z.enum(MODEL_KINDS).nullable(),
  /** The kind folder inside the models root ("loras"). */
  kindFolder: z.string(),
  /** The subfolder inside it ("Illustrious/Creator"). */
  folder: z.string(),
  file: z.string(),
  /** models root + kindFolder + folder + file, as the server will write it. */
  path: z.string(),
  size: z.number().nullable(),
  /** A different file already has that name; the download gets a free name like "foo (2)". */
  nameTaken: z.boolean(),
  /** This exact file is already in the models folder (same Civitai version or same file). */
  installed: z.string().nullable(),
  /** Why it can't be downloaded (no models folder, no API key for an early-access file…). */
  blocked: z.string().nullable(),
});
export type DownloadPlan = z.infer<typeof DownloadPlan>;

/* ── where files land ────────────────────────────────────────────────────── */

/** Civitai's category tags, in the order they win when a model has several. */
export const CATEGORY_TAGS = [
  "character",
  "celebrity",
  "style",
  "concept",
  "clothing",
  "poses",
  "background",
  "vehicle",
  "buildings",
  "objects",
  "animal",
  "action",
  "tool",
  "assets",
] as const;

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** One folder or file-name segment Windows accepts ("Flux.1 D", "Some: Name" → "Some Name"). */
export function safeSegment(raw: string, max = 80): string {
  let s = raw
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control characters on purpose.
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  if (s.length > max) s = s.slice(0, max).replace(/[. ]+$/, "");
  if (RESERVED.test(s)) s = `${s}_`;
  return s;
}

export interface PlanInput {
  fileName: string;
  modelName: string;
  versionName: string;
  baseModel: string | null;
  creator: string | null;
  tags: string[];
}

export function categoryOf(tags: string[]): string | null {
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  const hit = CATEGORY_TAGS.find((c) => lower.has(c));
  return hit ? hit[0]?.toUpperCase() + hit.slice(1) : null;
}

type Aliases = CivitaiSettings["downloads"]["aliases"];

/** The prefix you or Blombo gave this author, or null. */
export function aliasFor(creator: string, aliases: Aliases): string | null {
  return aliases.find((a) => a.from.toLowerCase() === creator.toLowerCase())?.to ?? null;
}

/**
 * A short prefix made from a username: the first letter, the consonants after it (repeats
 * collapsed, up to 6 letters) and the digits, so "yeetah145" → "yth145". When another author
 * already has it, "-2", "-3"… follows.
 */
export function autoPrefix(creator: string, taken: Iterable<string>): string {
  const plain = creator
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const letters = plain.replace(/\d/g, "");
  const short = `${letters.slice(0, 1)}${letters.slice(1).replace(/[aeiou]/g, "")}`
    .replace(/(.)\1+/g, "$1")
    .slice(0, 6);
  const base =
    `${short}${plain.replace(/\D/g, "").slice(0, 6)}` ||
    safeSegment(creator, 12).replace(/[\s._-]+/g, "") ||
    "author";
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  let prefix = base;
  for (let n = 2; used.has(prefix.toLowerCase()); n++) prefix = `${base}-${n}`;
  return prefix;
}

/** The sorted subfolder for a Civitai file ("Illustrious/Character/yeetah145"), "" for none. */
export function planFolder(input: PlanInput, folderBy: DownloadFolderPart[]): string {
  const parts: string[] = [];
  for (const part of folderBy) {
    const value =
      part === "baseModel"
        ? input.baseModel
        : part === "category"
          ? categoryOf(input.tags)
          : input.creator;
    const seg = value ? safeSegment(value, 60) : "";
    if (seg) parts.push(seg);
  }
  return parts.join("/");
}

/** The file name for a Civitai file, keeping its extension; `prefix` goes first ("yth145_"). */
export function planFileName(
  input: PlanInput,
  naming: DownloadNaming,
  prefix: string | null = null,
): string {
  const dot = input.fileName.lastIndexOf(".");
  const raw = dot > 0 ? input.fileName.slice(dot).toLowerCase() : "";
  // Only a plain extension: a remote name like "m.st:x" (an NTFS stream) or "x./../y" is not one.
  const ext = /^\.[a-z0-9]{1,10}$/.test(raw) ? raw : ".safetensors";
  const original = dot > 0 ? input.fileName.slice(0, dot) : input.fileName;
  const stem =
    naming === "model"
      ? input.modelName
      : naming === "model-version"
        ? `${input.modelName} - ${input.versionName}`
        : original;
  const name = safeSegment(stem, 150) || safeSegment(original, 150) || "model";
  const lead = prefix ? safeSegment(prefix, 40) : "";
  return `${lead ? `${lead}_` : ""}${name}${ext}`;
}

/** A planned file name with its stem replaced by one a person typed (made safe; extension kept). */
export function renamedFile(planned: string, name: string): string {
  const dot = planned.lastIndexOf(".");
  const ext = dot > 0 ? planned.slice(dot) : "";
  const typed =
    name.toLowerCase().endsWith(ext.toLowerCase()) && ext ? name.slice(0, -ext.length) : name;
  const stem = safeSegment(typed, 150);
  return stem ? `${stem}${ext}` : planned;
}

/** The first folder of a kind ("loras" for LoRAs, "diffusion_models" not "unet"). */
export function kindFolder(kind: ModelKind): string {
  return MODEL_FOLDERS[kind][0] ?? kind;
}

/** A relative folder typed by a person, cleaned into "a/b" form (segments made safe). */
export function cleanFolder(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => safeSegment(p, 80))
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
}

/** "4.71MB" → bytes (the ComfyUI catalog's sizes). */
export function parseSize(text: string | null | undefined): number | null {
  const m = /^\s*([\d.]+)\s*([KMGT]?)i?B?\s*$/i.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toUpperCase();
  const pow = unit === "K" ? 1 : unit === "M" ? 2 : unit === "G" ? 3 : unit === "T" ? 4 : 0;
  return Math.round(n * 1024 ** pow);
}

export const isActive = (s: DownloadState) => s === "queued" || s === "running";
export const isFinished = (s: DownloadState) => s === "done" || s === "error" || s === "cancelled";
