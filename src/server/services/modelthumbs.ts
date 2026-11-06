/**
 * A model's pictures live in a folder next to it, named after the model:
 *
 *   loras/style/Detailer.safetensors
 *   loras/style/Detailer_data/thumb.jpg       what cards show (0.25 MP JPEG by default)
 *   loras/style/Detailer_data/thumb_raw.png   the full-size original (or .mp4 / .webm / .webp…)
 *
 * How the card picture is saved (size, format, quality), whether the original is kept and whether
 * an animated picture stays animated (a WebP thumb, the original GIF or WebP as raw) follow
 * Settings → Models → Pictures.
 *
 * The folder may hold other tools' files (model_data.json): only thumb.* and thumb_raw.* are
 * Blombo's. The scan reads them, Civitai downloads save them (never over an existing picture),
 * and the Thumbnails script replaces them, moving the old ones to the profile's trash first.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ModelSettings, type PictureSettings } from "../../shared/settings.ts";
import { movePath, writeFileAtomic } from "../lib/fsx.ts";
import { EXTENSIONS } from "../lib/saveformat.ts";

// No file cache: on Windows it would keep files open (see lib/thumbs.ts).
sharp.cache(false);

export const DATA_SUFFIX = "_data";
const DEFAULT_PICTURES = ModelSettings.parse({}).pictures;
/** What `thumb.*` can be: an image the thumbnail cache can read. */
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

/** The pictures in a model's data folder (none when it has no folder). */
export async function findThumbs(dataDir: string): Promise<ModelThumbs> {
  let names: string[];
  try {
    names = await fs.readdir(dataDir);
  } catch {
    return { thumb: null, raw: null };
  }
  let thumb: string | null = null;
  let raw: string | null = null;
  for (const name of names) {
    const lower = name.toLowerCase();
    const ext = path.extname(lower);
    const base = lower.slice(0, lower.length - ext.length);
    if (base === "thumb" && THUMB_EXTS.has(ext)) thumb ??= path.join(dataDir, name);
    else if (base === "thumb_raw") raw ??= path.join(dataDir, name);
  }
  return { thumb, raw };
}

/** The card picture's size: as big as `megapixels` allows, never bigger than the image. */
export function thumbSize(width: number, height: number, megapixels: number) {
  const scale = Math.min(1, Math.sqrt((megapixels * 1e6) / Math.max(1, width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Save an image as the model's pictures: thumb.* (the card picture) and thumb_raw.* (the
 * original), as `pictures` says. With `replace` off an existing picture wins and nothing is
 * written (returns false). With `replace` on the old pictures move into `trashDir` first, so a
 * replaced picture can be put back by hand.
 */
export async function saveModelThumbs(
  modelFile: string,
  image: Uint8Array,
  opts: ({ replace: false } | { replace: true; trashDir: string }) & {
    pictures?: PictureSettings;
  },
): Promise<boolean> {
  const pictures = opts.pictures ?? DEFAULT_PICTURES;
  const dir = dataDirOf(modelFile);
  const old = await findThumbs(dir);
  if ((old.thumb || old.raw) && !opts.replace) return false;
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
  if (opts.replace) {
    const stamp = `${Date.now().toString(36)}-${path.basename(dir)}`;
    for (const file of [old.thumb, old.raw])
      if (file) await movePath(file, path.join(opts.trashDir, stamp, path.basename(file)));
  }
  if (raw) await writeFileAtomic(path.join(dir, `thumb_raw${raw.ext}`), raw.data);
  await writeFileAtomic(path.join(dir, `thumb${thumbExt}`), thumb);
  return true;
}
