/**
 * The few EXIF strings image tools store generation data in, read from a TIFF block:
 *
 *   IFD0 text tags (0x010F Make, 0x010E ImageDescription, 0x0110 Model…)
 *                                                       ComfyUI's WebP: "prompt:{…}", "workflow:{…}"
 *   0x9286 UserComment (Exif IFD)                       A1111 / Forge JPEG and WebP "parameters"
 *
 * Everything else in EXIF is ignored. Malformed blocks return what could be read.
 */

const EXIF_IFD = 0x8769;
const USER_COMMENT = 0x9286;

export interface ExifStrings {
  /** IFD0 strings in tag order. */
  strings: string[];
  userComment: string | null;
}

function decodeUserComment(bytes: Uint8Array, little: boolean): string | null {
  if (bytes.byteLength <= 8) return null;
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  const body = bytes.subarray(8);
  if (prefix.startsWith("UNICODE")) {
    // Writers disagree on byte order; zero high bytes at even offsets mean big-endian.
    let zerosEven = 0;
    let zerosOdd = 0;
    for (let i = 0; i < Math.min(body.byteLength, 400); i++)
      if (body[i] === 0) i % 2 === 0 ? zerosEven++ : zerosOdd++;
    const be = zerosEven > zerosOdd || (zerosEven === zerosOdd && !little);
    return new TextDecoder(be ? "utf-16be" : "utf-16le").decode(body).replace(/\0+$/, "");
  }
  return new TextDecoder("utf-8").decode(body).replace(/\0+$/, "");
}

export function readExifStrings(tiff: Uint8Array): ExifStrings {
  const out: ExifStrings = { strings: [], userComment: null };
  if (tiff.byteLength < 8) return out;
  const order = String.fromCharCode(tiff[0] ?? 0, tiff[1] ?? 0);
  if (order !== "II" && order !== "MM") return out;
  const little = order === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const text = new TextDecoder("utf-8");

  const readIfd = (
    offset: number,
    onEntry: (tag: number, type: number, count: number, valueAt: number) => void,
  ) => {
    if (offset + 2 > tiff.byteLength) return;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.byteLength) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = count * (type === 3 ? 2 : type === 4 ? 4 : 1);
      const valueAt = size <= 4 ? e + 8 : u32(e + 8);
      onEntry(tag, type, count, valueAt);
    }
  };

  try {
    let exifIfd = 0;
    readIfd(u32(4), (tag, type, count, at) => {
      // ComfyUI counts down from 0x010F for each extra chunk, so take every text tag.
      if ((type === 2 || type === 7) && at + count <= tiff.byteLength) {
        const value = text.decode(tiff.subarray(at, at + count)).replace(/\0+$/, "");
        if (value) out.strings.push(value);
      } else if (tag === EXIF_IFD) {
        exifIfd = type === 4 ? u32(at) : 0;
      }
    });
    if (exifIfd)
      readIfd(exifIfd, (tag, _type, count, at) => {
        if (tag === USER_COMMENT && at + count <= tiff.byteLength)
          out.userComment = decodeUserComment(tiff.subarray(at, at + count), little);
      });
  } catch {
    // Truncated block: keep what was read.
  }
  return out;
}

/** "prompt:{…}" style strings → { prompt: "{…}" }. */
export function keyedJsonStrings(strings: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of strings) {
    const m = /^([A-Za-z_][\w-]{0,40}):\s*(\{[\s\S]*)$/.exec(s.trim());
    if (m?.[1] && m[2]) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}
