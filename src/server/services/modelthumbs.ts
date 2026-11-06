/**
 * A model's pictures live in a folder next to it, named after the model (ADR-0019):
 *
 *   loras/style/Detailer.safetensors
 *   loras/style/Detailer_data/thumbs/global.jpg        what cards show (0.25 MP JPEG by default)
 *   loras/style/Detailer_data/thumbs/global_raw.png    the full-size original (or .mp4 / .webp…)
 *   loras/style/Detailer_data/thumbs/<id>+<id>.jpg     a picture for scopes (shared/scopes.ts)
 *
 * A picture's key is its file name without the extension: "global" or scope ids. How the card
 * picture is saved (size, format, quality), whether the original is kept and whether an
 * animated picture stays animated (a WebP card picture, the original GIF or WebP as raw) follow
 * Settings → Models → Pictures.
 *
 * The folder may hold other tools' files (model_data.json): only the pictures in thumbs/ whose
 * names are keys are Blombo's. The scan reads them, Civitai downloads save the global one (never
 * over an existing picture), and the model info dialog and the Thumbnails script replace them,
 * moving the old ones to the profile's trash first.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cleanKey, GLOBAL_KEY } from "../../shared/scopes.ts";
import { ModelSettings, type PictureSettings } from "../../shared/settings.ts";
import { exists, movePath, writeFileAtomic } from "../lib/fsx.ts";
import { EXTENSIONS } from "../lib/saveformat.ts";

// No file cache: on Windows it would keep files open (see lib/thumbs.ts).
sharp.cache(false);

export const DATA_SUFFIX = "_data";
/** The pictures' folder inside a model's data folder. */
export const PICTURES_DIR = "thumbs";
const DEFAULT_PICTURES = ModelSettings.parse({}).pictures;
/** What a card picture can be: an image the thumbnail cache can read. */
const THUMB_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
/** What a raw picture is served as; other raw files (videos) aren't shown as pictures. */
export const RAW_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** "…/Detailer.safetensors" → "…/Detailer_data". */
export function dataDirOf(modelFile: string): string {
  const stem = path.basename(modelFile, path.extname(modelFile));
  return path.join(path.dirname(modelFile), stem + DATA_SUFFIX);
}

export interface ModelThumbs {
  thumb: string | null;
  raw: string | null;
}

/** Every picture in a model's data folder, by key (empty when it has none). */
export async function findPictures(dataDir: string): Promise<Map<string, ModelThumbs>> {
  const dir = path.join(dataDir, PICTURES_DIR);
  const out = new Map<string, ModelThumbs>();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    const base = name.slice(0, name.length - ext.length).toLowerCase();
    const isRaw = base.endsWith("_raw");
    const key = cleanKey(isRaw ? base.slice(0, -4) : base);
    if (!key || (!isRaw && !THUMB_EXTS.has(ext))) continue;
    const pics = out.get(key) ?? { thumb: null, raw: null };
    if (isRaw) pics.raw ??= path.join(dir, name);
    else pics.thumb ??= path.join(dir, name);
    out.set(key, pics);
  }
  return out;
}

/** The card picture's size: as big as `megapixels` allows, never bigger than the image. */
export function thumbSize(width: number, height: number, megapixels: number) {
  const scale = Math.min(1, Math.sqrt((megapixels * 1e6) / Math.max(1, width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Move a picture's files into `trashDir` (a folder per removal). Returns how many moved. */
async function trashPictures(dataDir: string, pics: ModelThumbs, trashDir: string) {
  const stamp = `${Date.now().toString(36)}-${path.basename(dataDir)}`;
  let moved = 0;
  for (const file of [pics.thumb, pics.raw])
    if (file) {
      await movePath(file, path.join(trashDir, stamp, path.basename(file)));
      moved++;
    }
  return moved;
}

/**
 * Save an image as one of the model's pictures (`key`, global by default): <key>.* (the card
 * picture) and <key>_raw.* (the original), as `pictures` says. With `replace` off an existing
 * picture wins and nothing is written (returns false). With `replace` on the old picture moves
 * into `trashDir` first, so a replaced picture can be put back by hand.
 */
export async function saveModelThumbs(
  modelFile: string,
  image: Uint8Array,
  opts: ({ replace: false } | { replace: true; trashDir: string }) & {
    pictures?: PictureSettings;
    key?: string;
  },
): Promise<boolean> {
  const pictures = opts.pictures ?? DEFAULT_PICTURES;
  const key = cleanKey(opts.key);
  if (!key) throw new Error(`"${opts.key}" isn't a picture key.`);
  const dataDir = dataDirOf(modelFile);
  const dir = path.join(dataDir, PICTURES_DIR);
  const old = (await findPictures(dataDir)).get(key);
  if (old && !opts.replace) return false;
  // Read the new image first: one that can't be read leaves the old picture where it is.
  const bytes = Buffer.from(image);
  const meta = await sharp(bytes, { failOn: "none", animated: true }).metadata();
  const animated = pictures.animated && (meta.pages ?? 1) > 1;
  const source = sharp(bytes, { failOn: "none", animated }).rotate();
  const frameH = meta.pageHeight ?? meta.height ?? 1;
  const size = thumbSize(meta.width ?? 1, frameH, pictures.megapixels);
  let thumb: Buffer;
  let thumbExt: string;
  if (animated) {
    thumb = await source
      .clone()
      .resize({ width: size.width })
      .webp({ quality: pictures.quality })
      .toBuffer();
    thumbExt = ".webp";
  } else {
    const sized = source.clone().resize(size);
    thumb = await (pictures.format === "png"
      ? sized.png({ compressionLevel: 8 })
      : pictures.format === "webp"
        ? sized.webp({ quality: pictures.quality })
        : sized
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: pictures.quality, mozjpeg: true })
    ).toBuffer();
    thumbExt = EXTENSIONS[pictures.format];
  }
  // An animated original is kept as it came (GIF or WebP); a still one as PNG.
  const raw = !pictures.keepRaw
    ? null
    : animated && (meta.format === "gif" || meta.format === "webp")
      ? { data: bytes, ext: `.${meta.format}` }
      : { data: await source.clone().png({ compressionLevel: 8 }).toBuffer(), ext: ".png" };
  if (old && opts.replace) await trashPictures(dataDir, old, opts.trashDir);
  if (raw) await writeFileAtomic(path.join(dir, `${key}_raw${raw.ext}`), raw.data);
  await writeFileAtomic(path.join(dir, `${key}${thumbExt}`), thumb);
  return true;
}

/** Move one of the model's pictures to `trashDir`. Returns how many files moved (0: none there). */
export async function removeModelThumbs(
  modelFile: string,
  key: string,
  trashDir: string,
): Promise<number> {
  const dataDir = dataDirOf(modelFile);
  const pics = (await findPictures(dataDir)).get(key);
  return pics ? trashPictures(dataDir, pics, trashDir) : 0;
}

/**
 * The layout Blombo wrote between 2026-11-02 and ADR-0019 (`<model>_data/thumb.*` and
 * `thumb_raw.*`) → `thumbs/global.*` and `thumbs/global_raw.*`. Never overwrites: a picture whose
 * new name is taken stays where it is and is reported as skipped.
 */
export async function moveFlatPictures(
  dataDir: string,
): Promise<{ moved: string[]; skipped: string[] }> {
  const moved: string[] = [];
  const skipped: string[] = [];
  let names: string[];
  try {
    names = await fs.readdir(dataDir);
  } catch {
    return { moved, skipped };
  }
  for (const name of names) {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length).toLowerCase();
    const to = base === "thumb" ? GLOBAL_KEY : base === "thumb_raw" ? `${GLOBAL_KEY}_raw` : null;
    if (!to) continue;
    const target = path.join(dataDir, PICTURES_DIR, `${to}${ext.toLowerCase()}`);
    const from = path.join(dataDir, name);
    if (await exists(target)) {
      skipped.push(from);
      continue;
    }
    await movePath(from, target);
    moved.push(from);
  }
  return { moved, skipped };
}
