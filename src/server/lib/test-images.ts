/** Tiny hand-built PNG files for metadata tests (no pixels, just chunks). */
import { deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  return out; // CRC left as zeros: the reader doesn't verify it
}

export const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

export const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const utf8 = (s: string) => new TextEncoder().encode(s);

export function fakePng(
  text: Record<string, string>,
  itxt: Record<string, string> = {},
): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", new Uint8Array(13))];
  for (const [k, v] of Object.entries(text)) parts.push(chunk("tEXt", latin1(`${k}\0${v}`)));
  for (const [k, v] of Object.entries(itxt))
    parts.push(
      chunk(
        "iTXt",
        concat(latin1(`${k}\0`), new Uint8Array([1, 0]), latin1("\0\0"), deflateSync(utf8(v))),
      ),
    );
  parts.push(chunk("IEND", new Uint8Array()));
  return concat(...parts);
}
