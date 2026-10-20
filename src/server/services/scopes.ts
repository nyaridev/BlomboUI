/**
 * Scope thumbnails: pictures of models made by the "scope thumbnails" script, kept per scope in
 * the profile (data/profiles/<id>/scopes/<scope>/<kind>/<ComfyUI name>.webp). They never touch
 * the models folder. Models → Local and the Generate pickers show the "default" scope's picture
 * for a model that has no preview image of its own; picking other scopes comes with Scopes.
 */
import path from "node:path";
import sharp from "sharp";
import type { ModelKind } from "../../shared/constants.ts";
import { writeFileAtomic } from "../lib/fsx.ts";

// No file cache: on Windows it would keep files open (see lib/thumbs.ts).
sharp.cache(false);

export const DEFAULT_SCOPE = "default";
const SIZE = 512;

/** Where a model's scope thumbnail lives, or null for a name that tries to leave the folder. */
export function scopeThumbPath(
  profileDir: string,
  scope: string,
  kind: ModelKind,
  comfyName: string,
): string | null {
  const parts = comfyName.replace(/\\/g, "/").split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return null;
  return `${path.join(profileDir, "scopes", scope, kind, ...parts)}.webp`;
}

/** Shrink a finished image into the model's scope thumbnail (replacing the last one). */
export async function saveScopeThumb(
  profileDir: string,
  scope: string,
  kind: ModelKind,
  comfyName: string,
  image: Uint8Array,
): Promise<string | null> {
  const file = scopeThumbPath(profileDir, scope, kind, comfyName);
  if (!file) return null;
  const webp = await sharp(image)
    .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  await writeFileAtomic(file, webp);
  return file;
}
