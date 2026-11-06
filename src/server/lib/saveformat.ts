/**
 * Encode an image as PNG, JPEG or WebP and keep its generation data. A PNG keeps its text
 * chunks as they were (the source is copied); JPEG and WebP get the data as EXIF strings
 * ("prompt:{…}", "workflow:{…}", "blombo:{…}"), the way ComfyUI's WebP saver writes them and the
 * gallery reads them (lib/imagemeta.ts).
 *
 * libvips writes EXIF strings as ASCII and drops a block past 64 KB, so the JSON is written with
 * \u escapes (still the same JSON) and pieces go in by importance until the block is full: the
 * Blombo record, then the API graph, then the canvas workflow, which a big graph may not fit.
 */
import sharp from "sharp";
import type { ImageFormat } from "../../shared/settings.ts";

sharp.cache(false);

const EXIF_BUDGET = 60_000;
/** Which piece goes in which IFD0 text tag, most important first. */
const PIECES = [
  ["blombo", "ImageDescription"],
  ["prompt", "Model"],
  ["workflow", "Make"],
  ["parameters", "Artist"],
] as const;

export const EXTENSIONS: Record<ImageFormat, string> = { png: ".png", jpeg: ".jpg", webp: ".webp" };

const ascii = (s: string) =>
  s.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** The EXIF IFD0 strings for an image's text metadata, as many as fit. */
export function exifStrings(text: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let used = 0;
  for (const [key, tag] of PIECES) {
    const value = text[key];
    if (!value) continue;
    // A1111 text isn't JSON: escaping keeps it readable as the same characters.
    const entry = `${key}:${ascii(value)}`;
    if (used + entry.length > EXIF_BUDGET) continue;
    out[tag] = entry;
    used += entry.length;
  }
  return out;
}

/** The image in `format`, with `text` (prompt, workflow, blombo…) kept as metadata. */
export async function encodeImage(
  input: Buffer | Uint8Array,
  format: ImageFormat,
  quality: number,
  text: Record<string, string> = {},
): Promise<Buffer> {
  const image = sharp(Buffer.from(input), { failOn: "none", animated: false });
  if (format === "png") return image.png({ compressionLevel: 6 }).toBuffer();
  const exif = exifStrings(text);
  const withData = Object.keys(exif).length ? image.withExif({ IFD0: exif }) : image;
  return format === "jpeg"
    ? withData.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer()
    : withData.webp({ quality }).toBuffer();
}
