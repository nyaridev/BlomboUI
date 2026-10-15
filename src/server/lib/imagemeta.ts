/**
 * Text metadata embedded in images, read without decoding pixels.
 *
 *  - PNG: tEXt (Latin-1), zTXt (deflated) and iTXt (UTF-8, optionally deflated) chunks.
 *    ComfyUI writes "prompt" (API graph) and "workflow" (UI graph); A1111-style tools write
 *    "parameters".
 *  - WebP: ComfyUI stores "prompt:{…}" and "workflow:{…}" strings inside the EXIF chunk.
 *  - JPEG: A1111-style "parameters" in the EXIF UserComment.
 *
 * `readImageHead` reads a file without loading it: chunk and segment headers are read one by
 * one and pixel data is skipped, so indexing a big outputs folder stays cheap.
 */
import fs from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { keyedJsonStrings, readExifStrings } from "./exif.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

export function isWebp(bytes: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  return bytes.byteLength > 12 && tag(0) === "RIFF" && tag(8) === "WEBP";
}

const TEXT_CHUNKS = new Set(["tEXt", "zTXt", "iTXt"]);

/** Decode one PNG text chunk into `out`. A broken chunk is skipped, not fatal. */
function decodePngTextChunk(type: string, data: Uint8Array, out: Record<string, string>): void {
  const latin1 = new TextDecoder("latin1");
  try {
    const nul = data.indexOf(0);
    if (nul <= 0) return;
    const key = latin1.decode(data.subarray(0, nul));
    if (type === "tEXt") {
      out[key] = latin1.decode(data.subarray(nul + 1));
    } else if (type === "zTXt") {
      out[key] = latin1.decode(inflateSync(data.subarray(nul + 2)));
    } else if (type === "iTXt") {
      const compressed = data[nul + 1] === 1;
      let p = nul + 3;
      p = data.indexOf(0, p) + 1; // language tag
      p = data.indexOf(0, p) + 1; // translated keyword
      if (p > 0) {
        const text = data.subarray(p);
        out[key] = new TextDecoder("utf-8").decode(compressed ? inflateSync(text) : text);
      }
    }
  } catch {
    // A broken chunk shouldn't hide the others.
  }
}

export function readPngText(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPng(bytes)) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder("latin1");
  let pos = 8;
  while (pos + 8 <= bytes.byteLength) {
    const len = view.getUint32(pos, false);
    const type = latin1.decode(bytes.subarray(pos + 4, pos + 8));
    const start = pos + 8;
    const end = start + len;
    if (end > bytes.byteLength) break;
    if (TEXT_CHUNKS.has(type)) decodePngTextChunk(type, bytes.subarray(start, end), out);
    else if (type === "IEND") break;
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

/* ── header-only reading ────────────────────────────────────────────────── */

export type ImageFormat = "png" | "webp" | "jpeg" | "other";

export interface ImageHead {
  format: ImageFormat;
  width: number | null;
  height: number | null;
  /** Text metadata by key: prompt, workflow, blombo, parameters… */
  text: Record<string, string>;
}

type ReadAt = (pos: number, length: number) => Promise<Uint8Array>;

/** Text chunks larger than this are skipped (nobody stores 64 MB of metadata). */
const MAX_TEXT_CHUNK = 64 * 1024 * 1024;

function exifInto(tiff: Uint8Array, out: Record<string, string>): void {
  const exif = readExifStrings(tiff);
  Object.assign(out, keyedJsonStrings(exif.strings));
  if (exif.userComment?.trim() && !out.parameters) out.parameters = exif.userComment;
  // Blocks that aren't valid TIFF still often carry ComfyUI's strings.
  if (!out.prompt && !out.workflow) {
    const raw = new TextDecoder("utf-8").decode(tiff);
    for (const key of ["prompt", "workflow", "blombo"]) {
      const json = jsonAfter(raw, `${key}:`);
      if (json) out[key] = json;
    }
  }
}

async function readPng(readAt: ReadAt, size: number): Promise<ImageHead> {
  const head: ImageHead = { format: "png", width: null, height: null, text: {} };
  const latin1 = new TextDecoder("latin1");
  let pos = 8;
  while (pos + 8 <= size) {
    const h = await readAt(pos, 8);
    if (h.byteLength < 8) break;
    const len = new DataView(h.buffer, h.byteOffset, 8).getUint32(0, false);
    const type = latin1.decode(h.subarray(4, 8));
    if (type === "IHDR" && len >= 8) {
      const d = await readAt(pos + 8, 8);
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (d.byteLength >= 8) {
        head.width = v.getUint32(0, false);
        head.height = v.getUint32(4, false);
      }
    } else if (TEXT_CHUNKS.has(type) && len <= MAX_TEXT_CHUNK) {
      decodePngTextChunk(type, await readAt(pos + 8, len), head.text);
    } else if (type === "eXIf" && len <= MAX_TEXT_CHUNK) {
      exifInto(await readAt(pos + 8, len), head.text);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  return head;
}

async function readWebp(readAt: ReadAt, size: number): Promise<ImageHead> {
  const head: ImageHead = { format: "webp", width: null, height: null, text: {} };
  const latin1 = new TextDecoder("latin1");
  let pos = 12;
  while (pos + 8 <= size) {
    const h = await readAt(pos, 8);
    if (h.byteLength < 8) break;
    const fourcc = latin1.decode(h.subarray(0, 4));
    const len = new DataView(h.buffer, h.byteOffset, 8).getUint32(4, true);
    if (fourcc === "VP8X" && len >= 10) {
      const d = await readAt(pos + 8, 10);
      head.width = 1 + ((d[4] ?? 0) | ((d[5] ?? 0) << 8) | ((d[6] ?? 0) << 16));
      head.height = 1 + ((d[7] ?? 0) | ((d[8] ?? 0) << 8) | ((d[9] ?? 0) << 16));
    } else if (fourcc === "VP8 " && head.width === null && len >= 10) {
      const d = await readAt(pos + 8, 10);
      head.width = ((d[6] ?? 0) | ((d[7] ?? 0) << 8)) & 0x3fff;
      head.height = ((d[8] ?? 0) | ((d[9] ?? 0) << 8)) & 0x3fff;
    } else if (fourcc === "VP8L" && head.width === null && len >= 5) {
      const d = await readAt(pos + 8, 5);
      const bits =
        ((d[1] ?? 0) | ((d[2] ?? 0) << 8) | ((d[3] ?? 0) << 16) | ((d[4] ?? 0) << 24)) >>> 0;
      head.width = (bits & 0x3fff) + 1;
      head.height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (fourcc === "EXIF" && len <= MAX_TEXT_CHUNK) {
      let tiff = await readAt(pos + 8, len);
      // Some writers keep the JPEG-style "Exif\0\0" prefix.
      if (latin1.decode(tiff.subarray(0, 4)) === "Exif") tiff = tiff.subarray(6);
      exifInto(tiff, head.text);
    }
    pos += 8 + len + (len % 2);
  }
  return head;
}

async function readJpeg(readAt: ReadAt, size: number): Promise<ImageHead> {
  const head: ImageHead = { format: "jpeg", width: null, height: null, text: {} };
  const latin1 = new TextDecoder("latin1");
  let pos = 2;
  while (pos + 4 <= size) {
    const h = await readAt(pos, 4);
    if (h[0] !== 0xff) break;
    const marker = h[1] ?? 0;
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // image data starts / ends
    const len = ((h[2] ?? 0) << 8) | (h[3] ?? 0);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof && len >= 7) {
      const d = await readAt(pos + 4, 5);
      head.height = ((d[1] ?? 0) << 8) | (d[2] ?? 0);
      head.width = ((d[3] ?? 0) << 8) | (d[4] ?? 0);
    } else if (marker === 0xe1 && len > 8) {
      const d = await readAt(pos + 4, len - 2);
      if (latin1.decode(d.subarray(0, 4)) === "Exif") exifInto(d.subarray(6), head.text);
    } else if (marker === 0xfe && len > 2) {
      const d = await readAt(pos + 4, len - 2);
      const comment = new TextDecoder("utf-8").decode(d).trim();
      if (comment && !head.text.parameters) head.text.parameters = comment;
    }
    pos += 2 + len;
  }
  return head;
}

async function readHead(readAt: ReadAt, size: number): Promise<ImageHead> {
  const sig = await readAt(0, 16);
  if (isPng(sig)) return readPng(readAt, size);
  if (isWebp(sig)) return readWebp(readAt, size);
  if (sig[0] === 0xff && sig[1] === 0xd8) return readJpeg(readAt, size);
  return { format: "other", width: null, height: null, text: {} };
}

/** Format, size and text metadata of an image file, reading only what's needed. */
export async function readImageHead(file: string): Promise<ImageHead> {
  const handle = await fs.open(file, "r");
  try {
    const { size } = await handle.stat();
    return await readHead(async (pos, length) => {
      const n = Math.max(0, Math.min(length, size - pos));
      const buf = new Uint8Array(n);
      if (n) await handle.read(buf, 0, n, pos);
      return buf;
    }, size);
  } finally {
    await handle.close();
  }
}

/** The same for bytes already in memory (an uploaded file). */
export function readImageHeadBytes(bytes: Uint8Array): Promise<ImageHead> {
  return readHead(
    async (pos, length) => bytes.subarray(pos, Math.min(bytes.byteLength, pos + length)),
    bytes.byteLength,
  );
}
