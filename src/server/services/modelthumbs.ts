/**
 * A model's pictures live in a folder next to it, named after the model:
 *
 *   loras/style/Detailer.safetensors
 *   loras/style/Detailer_data/thumb.jpg       what cards show (fits in 576 px)
 *   loras/style/Detailer_data/thumb_raw.png   the full-size original (or .mp4 / .webm / .webp…)
 *
 * The folder may hold other tools' files (model_data.json): only thumb.* and thumb_raw.* are
 * Blombo's. The scan reads them, Civitai downloads save them (never over an existing picture),
 * and the Thumbnails script replaces them, moving the old ones to the profile's trash first.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { movePath, writeFileAtomic } from "../lib/fsx.ts";

// No file cache: on Windows it would keep files open (see lib/thumbs.ts).
sharp.cache(false);

export const DATA_SUFFIX = "_data";
const THUMB_MAX = 576;
/** What `thumb.*` can be: an image the thumbnail cache can read. */
const THUMB_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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

/**
 * Save an image as the model's pictures: thumb.jpg and thumb_raw.png. With `replace` off an
 * existing picture wins and nothing is written (returns false). With `replace` on the old
 * pictures move into `trashDir` first, so a replaced picture can be put back by hand.
 */
export async function saveModelThumbs(
  modelFile: string,
  image: Uint8Array,
  opts: { replace: false } | { replace: true; trashDir: string },
): Promise<boolean> {
  const dir = dataDirOf(modelFile);
  const old = await findThumbs(dir);
  if ((old.thumb || old.raw) && !opts.replace) return false;
  // Read the new image first: one that can't be read leaves the old picture where it is.
  const source = sharp(Buffer.from(image), { failOn: "none" }).rotate();
  const raw = await source.clone().png({ compressionLevel: 8 }).toBuffer();
  const thumb = await source
    .clone()
    .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  if (opts.replace) {
    const stamp = `${Date.now().toString(36)}-${path.basename(dir)}`;
    for (const file of [old.thumb, old.raw])
      if (file) await movePath(file, path.join(opts.trashDir, stamp, path.basename(file)));
  }
  await writeFileAtomic(path.join(dir, "thumb_raw.png"), raw);
  await writeFileAtomic(path.join(dir, "thumb.jpg"), thumb);
  return true;
}
