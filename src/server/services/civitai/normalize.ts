/**
 * Civitai's API answers → the shapes in shared/civitai.ts. Pure (no network, no disk), so it's
 * tested with recorded responses. Every image URL is rewritten to a sized variant behind
 * Blombo's proxy, and images from hosts the proxy won't fetch are dropped.
 */
import {
  type CivitaiCard,
  type CivitaiFile,
  type CivitaiImage,
  type CivitaiModel,
  type CivitaiVersion,
  civitaiImageVariant,
  civitaiKind,
  type LocalMark,
  NSFW_LEVEL,
  proxiedImage,
} from "../../../shared/civitai.ts";
import type { LookupInfo } from "../../../shared/models.ts";
import { blocksToText, htmlToBlocks, type RichBlock } from "../../../shared/richtext.ts";
import type { RawFile, RawImage, RawModel, RawVersion } from "./api.ts";

export const THUMB_WIDTH = 450;
export const FULL_WIDTH = 1280;
export const PREVIEW_WIDTH = 512;

export interface NormalizeContext {
  /** Whether the image proxy will fetch this URL. */
  allowed: (url: string) => boolean;
  /** Civitai's site, for links ("https://civitai.com"). */
  site: string;
  /** Local copies by model id: the version ids found in the models folder. */
  local: (modelId: number, latestVersionId: number | null) => LocalMark | null;
}

export function isNsfwImage(img: RawImage): boolean {
  if (typeof img.nsfwLevel === "number") return img.nsfwLevel >= NSFW_LEVEL;
  if (typeof img.nsfw === "string")
    return !["none", "false", "", "soft"].includes(img.nsfw.toLowerCase());
  return img.nsfw === true;
}

export function image(
  img: RawImage | undefined,
  ctx: Pick<NormalizeContext, "allowed">,
): CivitaiImage | null {
  if (!img?.url || !ctx.allowed(img.url)) return null;
  const video = img.type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(img.url);
  return {
    thumb: proxiedImage(civitaiImageVariant(img.url, THUMB_WIDTH, video)),
    full: proxiedImage(civitaiImageVariant(img.url, FULL_WIDTH, video)),
    width: typeof img.width === "number" ? img.width : null,
    height: typeof img.height === "number" ? img.height : null,
    nsfw: isNsfwImage(img),
    video,
  };
}

/** The remote URL of a version's first image at preview size (for the .preview.png sidecar). */
export function previewSource(
  version: RawVersion | undefined,
  allowed: (u: string) => boolean,
): string | null {
  const img = version?.images?.find((i) => i.url && allowed(i.url));
  if (!img?.url) return null;
  const video = img.type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(img.url);
  return civitaiImageVariant(img.url, PREVIEW_WIDTH, video);
}

/** Description HTML → blocks; images only when the proxy may fetch them. */
export function description(
  html: string | null | undefined,
  ctx: Pick<NormalizeContext, "allowed" | "site">,
): RichBlock[] {
  if (!html) return [];
  return htmlToBlocks(html, ctx.site).flatMap((b): RichBlock[] => {
    if (b.t !== "img") return [b];
    if (!ctx.allowed(b.src)) return [];
    return [{ ...b, src: proxiedImage(civitaiImageVariant(b.src, 1024, false)) }];
  });
}

/** The first image to show for a card: skips NSFW ones when browsing without NSFW. */
function coverImage(model: RawModel, ctx: NormalizeContext, sfwOnly: boolean): CivitaiImage | null {
  for (const v of model.modelVersions ?? [])
    for (const img of v.images ?? []) {
      if (sfwOnly && isNsfwImage(img)) continue;
      const out = image(img, ctx);
      if (out) return out;
    }
  return null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function card(model: RawModel, ctx: NormalizeContext, sfwOnly = false): CivitaiCard {
  const latest = model.modelVersions?.[0];
  return {
    id: model.id,
    name: str(model.name) ?? `Model ${model.id}`,
    type: str(model.type) ?? "Other",
    kind: civitaiKind(model.type ?? ""),
    creator: str(model.creator?.username),
    nsfw: model.nsfw === true,
    baseModel: str(latest?.baseModel),
    downloads: num(model.stats?.downloadCount),
    likes: num(model.stats?.thumbsUpCount ?? model.stats?.favoriteCount),
    image: coverImage(model, ctx, sfwOnly),
    versionId: latest?.id ?? null,
    local: ctx.local(model.id, latest?.id ?? null),
  };
}

export function file(f: RawFile): CivitaiFile {
  const pickle = f.pickleScanResult;
  const virus = f.virusScanResult;
  const scanned = pickle !== undefined && pickle !== "Pending" && virus !== "Pending";
  return {
    id: num(f.id),
    name: str(f.name) ?? "model.safetensors",
    size: typeof f.sizeKB === "number" ? Math.round(f.sizeKB * 1024) : null,
    type: str(f.type) ?? "Model",
    format: str(f.metadata?.format),
    fp: str(f.metadata?.fp),
    primary: f.primary === true,
    safe: scanned ? pickle === "Success" && (virus === undefined || virus === "Success") : null,
    sha256: str(f.hashes?.SHA256)?.toUpperCase() ?? null,
  };
}

export function version(v: RawVersion, ctx: NormalizeContext): CivitaiVersion {
  return {
    id: v.id,
    name: str(v.name) ?? `Version ${v.id}`,
    baseModel: str(v.baseModel),
    publishedAt: str(v.publishedAt) ?? str(v.createdAt),
    trainedWords: (v.trainedWords ?? [])
      .map((w) => (typeof w === "string" ? w.trim() : ""))
      .filter(Boolean),
    description: description(v.description, ctx),
    downloads: num(v.stats?.downloadCount),
    files: (v.files ?? []).filter((f) => typeof f.id === "number").map(file),
    images: (v.images ?? []).map((i) => image(i, ctx)).filter((i): i is CivitaiImage => i !== null),
    earlyAccess:
      v.availability === "EarlyAccess" ||
      (typeof v.earlyAccessEndsAt === "string" && Date.parse(v.earlyAccessEndsAt) > Date.now()),
  };
}

export function model(raw: RawModel, ctx: NormalizeContext): CivitaiModel {
  const c = card(raw, ctx);
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    kind: c.kind,
    creator: c.creator,
    creatorImage: (() => {
      const url = str(raw.creator?.image);
      return url && ctx.allowed(url) ? proxiedImage(civitaiImageVariant(url, 96, false)) : null;
    })(),
    tags: (raw.tags ?? []).filter((t): t is string => typeof t === "string"),
    nsfw: c.nsfw,
    downloads: c.downloads,
    likes: c.likes,
    description: description(raw.description, ctx),
    versions: (raw.modelVersions ?? []).map((v) => version(v, ctx)),
    url: `${ctx.site}/models/${raw.id}`,
    local: c.local,
  };
}

/** The primary model file of a version (what "Download" gets). */
export function primaryFile(v: RawVersion): RawFile | undefined {
  const files = (v.files ?? []).filter((f) => typeof f.id === "number");
  return (
    files.find((f) => f.primary) ??
    files.find((f) => f.type === "Model") ??
    files.find((f) => /\.(safetensors|sft|gguf)$/i.test(f.name ?? "")) ??
    files[0]
  );
}

/**
 * What a lookup by hash (or a finished download) tells about a local file. `model` is the full
 * model when known; a by-hash answer has only `version.model` (name, type, nsfw).
 */
export function lookupInfo(
  v: RawVersion,
  ctx: Pick<NormalizeContext, "allowed" | "site">,
  full?: RawModel,
): LookupInfo | null {
  const modelId = v.modelId ?? full?.id;
  if (typeof modelId !== "number") return null;
  const first = (v.images ?? []).find((i) => i.url && ctx.allowed(i.url));
  const img = image(first, ctx);
  const desc = description(full?.description ?? v.description, ctx);
  return {
    modelId,
    versionId: v.id,
    name: str(full?.name) ?? str(v.model?.name) ?? str(v.name) ?? `Model ${modelId}`,
    version: str(v.name),
    type: str(full?.type) ?? str(v.model?.type),
    baseModel: str(v.baseModel),
    trainedWords: (v.trainedWords ?? [])
      .map((w) => (typeof w === "string" ? w.trim() : ""))
      .filter(Boolean),
    nsfw: (full?.nsfw ?? v.model?.nsfw) === true,
    creator: str(full?.creator?.username),
    image: img?.thumb ?? null,
    imageNsfw: img?.nsfw ?? false,
    description: desc.length ? blocksToText(desc).slice(0, 4000) : null,
  };
}

/**
 * The .civitai.info saved next to a download: the version as Civitai describes it, plus the
 * model's name, type, description and creator, the layout other tools read too.
 */
export function infoSidecar(raw: RawModel, v: RawVersion): Record<string, unknown> {
  return {
    ...v,
    modelId: raw.id,
    model: {
      name: raw.name,
      type: raw.type,
      nsfw: raw.nsfw,
      poi: (v.model as { poi?: boolean } | undefined)?.poi ?? false,
      description: raw.description ?? null,
      tags: raw.tags ?? [],
    },
    creator: raw.creator ?? null,
  };
}
