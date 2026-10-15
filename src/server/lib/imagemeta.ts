/**
 * Text metadata embedded in images, read without decoding pixels.
 *
 *  - PNG: tEXt (Latin-1), zTXt (deflated) and iTXt (UTF-8, optionally deflated) chunks.
 *    ComfyUI writes "prompt" (API graph) and "workflow" (UI graph); A1111-style tools write
 *    "parameters".
 *  - WebP: ComfyUI stores "prompt:{…}" and "workflow:{…}" strings inside the EXIF chunk.
 */
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  return bytes.byteLength > 12 && tag(0) === "RIFF" && tag(8) === "WEBP";
}

export function readPngText(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPng(bytes)) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder("latin1");
  const utf8 = new TextDecoder("utf-8");
  let pos = 8;
  while (pos + 8 <= bytes.byteLength) {
    const len = view.getUint32(pos, false);
    const type = latin1.decode(bytes.subarray(pos + 4, pos + 8));
    const start = pos + 8;
    const end = start + len;
    if (end > bytes.byteLength) break;
    const data = bytes.subarray(start, end);
    try {
      if (type === "tEXt") {
        const nul = data.indexOf(0);
        if (nul > 0)
          out[latin1.decode(data.subarray(0, nul))] = latin1.decode(data.subarray(nul + 1));
      } else if (type === "zTXt") {
        const nul = data.indexOf(0);
        if (nul > 0)
          out[latin1.decode(data.subarray(0, nul))] = latin1.decode(
            inflateSync(data.subarray(nul + 2)),
          );
      } else if (type === "iTXt") {
        const nul = data.indexOf(0);
        if (nul > 0) {
          const key = latin1.decode(data.subarray(0, nul));
          const compressed = data[nul + 1] === 1;
          let p = nul + 3;
          p = data.indexOf(0, p) + 1; // language tag
          p = data.indexOf(0, p) + 1; // translated keyword
          if (p > 0) {
            const text = data.subarray(p);
            out[key] = utf8.decode(compressed ? inflateSync(text) : text);
          }
        }
      } else if (type === "IEND") {
        break;
      }
    } catch {
      // A broken chunk shouldn't hide the others.
    }
    pos = end + 4;
  }
  return out;
}

/** The balanced JSON object that starts right after `marker` in `text`, if any. */
export function jsonAfter(text: string, marker: string): string | null {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf("{", at + marker.length);
  if (start !== at + marker.length) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function readWebpText(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isWebp(bytes)) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder("latin1");
  let pos = 12;
  while (pos + 8 <= bytes.byteLength) {
    const fourcc = latin1.decode(bytes.subarray(pos, pos + 4));
    const len = view.getUint32(pos + 4, true);
    const data = bytes.subarray(pos + 8, Math.min(bytes.byteLength, pos + 8 + len));
    if (fourcc === "EXIF") {
      const text = new TextDecoder("utf-8").decode(data);
      for (const key of ["prompt", "workflow"]) {
        const json = jsonAfter(text, `${key}:`);
        if (json) out[key] = json;
      }
    }
    pos += 8 + len + (len % 2);
  }
  return out;
}
