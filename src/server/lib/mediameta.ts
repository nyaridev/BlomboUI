/**
 * What the gallery needs from video and audio files, read without decoding them: size, length
 * and the text metadata ComfyUI writes.
 *
 *  - MP4: the box tree is walked by headers (the media data is skipped, wherever `moov` sits):
 *    `mvhd` gives the length, a video track's `tkhd` the size, and `udta/meta/ilst` the text:
 *    the `©cmt` comment Video Helper Suite writes (a JSON object: "prompt", "workflow", Blombo's
 *    chunk…), or the named tags ComfyUI's Save Video writes through ffmpeg (QuickTime metadata:
 *    a `keys` box names them, the `ilst` items are numbered after it).
 *  - FLAC: STREAMINFO gives the length, VORBIS_COMMENT the "prompt" / "workflow" ComfyUI's
 *    Save Audio writes.
 *  - WAV: the length from the format and data chunks.
 *  - MP3, OGG: nothing yet (the player shows the length once it loads).
 */
import fs from "node:fs/promises";

export interface MediaHead {
  width: number | null;
  height: number | null;
  /** Seconds. */
  duration: number | null;
  /** Text metadata by key, as `ImageHead.text` (prompt, workflow, blombo…). */
  text: Record<string, string>;
}

type ReadAt = (pos: number, length: number) => Promise<Uint8Array>;

const empty = (): MediaHead => ({ width: null, height: null, duration: null, text: {} });
const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
/** Comments larger than this are skipped. */
const MAX_TEXT = 64 * 1024 * 1024;

/** A JSON comment's keys as strings (objects stringified), so parseMeta can read them. */
export function textFromComment(comment: string): Record<string, string> {
  try {
    const parsed = JSON.parse(comment) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed))
      out[k] = typeof v === "string" ? v : JSON.stringify(v);
    return out;
  } catch {
    return {};
  }
}

/* ── MP4 ─────────────────────────────────────────────────────────────────── */

const CONTAINERS = new Set(["moov", "trak", "mdia", "udta", "ilst"]);

/** A tag's text: a comment is a JSON object of tags, anything else is one. */
function addTag(text: Record<string, string>, name: string, value: string) {
  if (name === "comment") Object.assign(text, textFromComment(value));
  else text[name] = value;
}

async function readMp4(readAt: ReadAt, size: number): Promise<MediaHead> {
  const head = empty();
  /** QuickTime metadata's tag names; `ilst` item n is keys[n - 1]. */
  const keys: string[] = [];
  const walk = async (start: number, end: number, depth: number, parent = ""): Promise<void> => {
    let pos = start;
    while (pos + 8 <= end && depth < 8) {
      const h = await readAt(pos, 16);
      if (h.byteLength < 8) return;
      let len = view(h).getUint32(0);
      const type = latin1.decode(h.subarray(4, 8));
      let body = pos + 8;
      if (len === 1 && h.byteLength >= 16) {
        len = Number(view(h).getBigUint64(8));
        body = pos + 16;
      } else if (len === 0) len = end - pos;
      if (len < 8) return;
      const boxEnd = Math.min(end, pos + len);
      if (CONTAINERS.has(type)) await walk(body, boxEnd, depth + 1, type);
      else if (type === "meta") {
        // A full box in MP4 (4 bytes of version and flags first), a plain one in QuickTime.
        const peek = await readAt(body + 4, 4);
        await walk(latin1.decode(peek) === "hdlr" ? body : body + 4, boxEnd, depth + 1);
      } else if (type === "mvhd") {
        const d = await readAt(body, 32);
        const v1 = d[0] === 1;
        const scale = view(d).getUint32(v1 ? 20 : 12);
        const length = v1 ? Number(view(d).getBigUint64(24)) : view(d).getUint32(16);
        if (scale) head.duration = length / scale;
      } else if (type === "tkhd") {
        const d = await readAt(body, 92);
        const at = d[0] === 1 ? 88 : 76;
        if (d.byteLength >= at + 8) {
          const w = view(d).getUint32(at) / 65536;
          const hh = view(d).getUint32(at + 4) / 65536;
          // The first track with a picture (an audio track has none).
          if (w > 0 && hh > 0 && head.width === null) {
            head.width = Math.round(w);
            head.height = Math.round(hh);
          }
        }
      } else if (type === "keys" && len <= MAX_TEXT) {
        // Version and flags, the count, then each key: size, namespace ("mdta"), name.
        const d = await readAt(body, boxEnd - body);
        let at = 8;
        while (at + 8 <= d.byteLength) {
          const size = view(d).getUint32(at);
          if (size < 8) break;
          keys.push(utf8.decode(d.subarray(at + 8, at + size)));
          at += size;
        }
      } else if (parent === "ilst" && len <= MAX_TEXT) {
        const name = type === "©cmt" ? "comment" : keys[view(h).getUint32(4) - 1];
        // An ilst item: a "data" box (type, locale) then the text.
        const d = name ? await readAt(body, boxEnd - body) : null;
        if (name && d && latin1.decode(d.subarray(4, 8)) === "data")
          addTag(head.text, name, utf8.decode(d.subarray(16)));
      }
      pos = boxEnd;
    }
  };
  await walk(0, size, 0);
  return head;
}

/* ── FLAC, WAV ───────────────────────────────────────────────────────────── */

async function readFlac(readAt: ReadAt, size: number): Promise<MediaHead> {
  const head = empty();
  let pos = 4;
  while (pos + 4 <= size) {
    const h = await readAt(pos, 4);
    if (h.byteLength < 4) break;
    const last = ((h[0] ?? 0) & 0x80) !== 0;
    const type = (h[0] ?? 0) & 0x7f;
    const len = ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0);
    if (type === 0 && len >= 18) {
      const d = await readAt(pos + 4, 18);
      const rate = ((d[10] ?? 0) << 12) | ((d[11] ?? 0) << 4) | ((d[12] ?? 0) >> 4);
      const samples = ((d[13] ?? 0) & 0x0f) * 2 ** 32 + view(d).getUint32(14);
      if (rate && samples) head.duration = samples / rate;
    } else if (type === 4 && len <= MAX_TEXT) {
      const d = await readAt(pos + 4, len);
      const v = view(d);
      let p = 4 + v.getUint32(0, true);
      const count = p + 4 <= d.byteLength ? v.getUint32(p, true) : 0;
      p += 4;
      for (let i = 0; i < count && p + 4 <= d.byteLength; i++) {
        const n = v.getUint32(p, true);
        const entry = utf8.decode(d.subarray(p + 4, p + 4 + n));
        const eq = entry.indexOf("=");
        if (eq > 0) head.text[entry.slice(0, eq).toLowerCase()] = entry.slice(eq + 1);
        p += 4 + n;
      }
    }
    pos += 4 + len;
    if (last) break;
  }
  return head;
}

async function readWav(readAt: ReadAt, size: number): Promise<MediaHead> {
  const head = empty();
  let byteRate = 0;
  let pos = 12;
  while (pos + 8 <= size) {
    const h = await readAt(pos, 8);
    if (h.byteLength < 8) break;
    const id = latin1.decode(h.subarray(0, 4));
    const len = view(h).getUint32(4, true);
    if (id === "fmt " && len >= 12) byteRate = view(await readAt(pos + 8, 12)).getUint32(8, true);
    else if (id === "data" && byteRate) head.duration = Math.min(len, size - pos - 8) / byteRate;
    pos += 8 + len + (len % 2);
  }
  return head;
}

/** Size, length and text metadata of a video or audio file, reading only what's needed. */
export async function readMediaHead(file: string): Promise<MediaHead> {
  const handle = await fs.open(file, "r");
  try {
    const { size } = await handle.stat();
    const readAt: ReadAt = async (pos, length) => {
      const n = Math.max(0, Math.min(length, size - pos));
      const buf = new Uint8Array(n);
      if (n) await handle.read(buf, 0, n, pos);
      return buf;
    };
    return await readMediaBytes(readAt, size);
  } finally {
    await handle.close();
  }
}

/** The same over any reader (tests, bytes in memory). */
export async function readMediaBytes(readAt: ReadAt, size: number): Promise<MediaHead> {
  const sig = await readAt(0, 12);
  const tag = (o: number) => latin1.decode(sig.subarray(o, o + 4));
  if (tag(4) === "ftyp") return readMp4(readAt, size);
  if (tag(0) === "fLaC") return readFlac(readAt, size);
  if (tag(0) === "RIFF" && tag(8) === "WAVE") return readWav(readAt, size);
  return empty();
}
