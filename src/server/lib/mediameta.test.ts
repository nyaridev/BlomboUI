import { describe, expect, it } from "vitest";
import { readMediaBytes, textFromComment } from "./mediameta.ts";
import { byteRange } from "./send.ts";

const enc = new TextEncoder();
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};
const u32 = (n: number, little = false) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, little);
  return b;
};
const box = (type: string, ...body: Uint8Array[]) => {
  const inner = cat(...body);
  const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
  return cat(u32(8 + inner.byteLength), t, inner);
};
const read = (bytes: Uint8Array) =>
  readMediaBytes(
    async (pos, length) => bytes.subarray(pos, Math.min(bytes.byteLength, pos + length)),
    bytes.byteLength,
  );

describe("readMediaBytes", () => {
  it("reads an MP4's size, length and Video Helper Suite's comment, moov after the data", async () => {
    const mvhd = box("mvhd", new Uint8Array(4), u32(0), u32(0), u32(1000), u32(2500));
    const tkhd = (w: number, h: number) =>
      box("tkhd", new Uint8Array(76), u32(w * 65536), u32(h * 65536));
    const comment = JSON.stringify({
      prompt: '{"3":{"class_type":"KSampler"}}',
      workflow: { nodes: [] },
    });
    const ilst = box("ilst", box("©cmt", box("data", u32(1), u32(0), enc.encode(comment))));
    const meta = box("meta", new Uint8Array(4), box("hdlr", new Uint8Array(24)), ilst);
    const mp4 = cat(
      box("ftyp", enc.encode("isom"), u32(0)),
      box("mdat", new Uint8Array(1000)),
      box("moov", mvhd, box("trak", tkhd(0, 0)), box("trak", tkhd(832, 1216)), box("udta", meta)),
    );
    const head = await read(mp4);
    expect(head).toMatchObject({ width: 832, height: 1216, duration: 2.5 });
    expect(head.text.prompt).toBe('{"3":{"class_type":"KSampler"}}');
    expect(JSON.parse(head.text.workflow ?? "")).toEqual({ nodes: [] });
  });

  it("counts the picture track's frames and works out its frame rate", async () => {
    const hdlr = (kind: string) =>
      box("hdlr", u32(0), u32(0), enc.encode(kind), new Uint8Array(12));
    const mdhd = (scale: number, length: number) =>
      box("mdhd", u32(0), u32(0), u32(0), u32(scale), u32(length), u32(0));
    // 70 frames at 1001 and 3 at 1000 in a 30000 time scale: 73 frames in 2.4357 s.
    const stts = box("stts", u32(0), u32(2), u32(70), u32(1001), u32(3), u32(1000));
    const trak = (kind: string, scale: number, length: number, table: Uint8Array) =>
      box("trak", box("mdia", mdhd(scale, length), hdlr(kind), box("minf", box("stbl", table))));
    const sound = box("stts", u32(0), u32(1), u32(500), u32(1024));
    const mp4 = cat(
      box("ftyp", enc.encode("isom"), u32(0)),
      box("moov", trak("soun", 48000, 512000, sound), trak("vide", 30000, 73070, stts)),
    );
    const head = await read(mp4);
    expect(head.frames).toBe(73);
    expect(head.fps).toBeCloseTo(29.971, 3);
  });

  it("reads the named tags ComfyUI's Save Video writes (QuickTime keys)", async () => {
    const key = (name: string) => box("mdta", enc.encode(name));
    const keys = box("keys", u32(0), u32(3), key("blombo"), key("prompt"), key("encoder"));
    const item = (n: number, text: string) =>
      cat(
        u32(8 + 16 + enc.encode(text).byteLength),
        u32(n),
        box("data", u32(1), u32(0), enc.encode(text)),
      );
    const ilst = box("ilst", item(1, '{"seed":7}'), item(2, '{"1":{}}'), item(3, "Lavf63"));
    const meta = box("meta", new Uint8Array(4), box("hdlr", new Uint8Array(24)), keys, ilst);
    const head = await read(
      cat(box("ftyp", enc.encode("isom"), u32(0)), box("moov", box("udta", meta))),
    );
    expect(head.text).toEqual({ blombo: '{"seed":7}', prompt: '{"1":{}}', encoder: "Lavf63" });
  });

  it("reads a FLAC's length and ComfyUI's comments", async () => {
    // STREAMINFO: 44100 Hz, 88200 samples (2 s).
    const info = new Uint8Array(34);
    const rate = 44100;
    info[10] = rate >> 12;
    info[11] = (rate >> 4) & 0xff;
    info[12] = (rate & 0x0f) << 4;
    new DataView(info.buffer).setUint32(14, 88200);
    const entry = enc.encode('prompt={"1":{}}');
    const comments = cat(u32(0, true), u32(1, true), u32(entry.byteLength, true), entry);
    const block = (type: number, last: boolean, body: Uint8Array) =>
      cat(
        Uint8Array.of(
          (last ? 0x80 : 0) | type,
          body.byteLength >> 16,
          (body.byteLength >> 8) & 0xff,
          body.byteLength & 0xff,
        ),
        body,
      );
    const flac = cat(enc.encode("fLaC"), block(0, false, info), block(4, true, comments));
    expect(await read(flac)).toMatchObject({ duration: 2, text: { prompt: '{"1":{}}' } });
  });

  it("reads a WAV's length", async () => {
    const fmt = cat(
      enc.encode("fmt "),
      u32(16, true),
      new Uint8Array(8),
      u32(16000, true),
      new Uint8Array(4),
    );
    const data = cat(enc.encode("data"), u32(8000, true), new Uint8Array(8000));
    const wav = cat(enc.encode("RIFF"), u32(0, true), enc.encode("WAVE"), fmt, data);
    expect((await read(wav)).duration).toBe(0.5);
  });

  it("leaves other files and broken comments empty", async () => {
    expect(await read(enc.encode("ID3 not much here"))).toEqual({
      width: null,
      height: null,
      duration: null,
      frames: null,
      fps: null,
      text: {},
    });
    expect(textFromComment("not json")).toEqual({});
  });
});

describe("byteRange", () => {
  it("answers the ranges players ask for", () => {
    expect(byteRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(byteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=200-", 100)).toBeNull();
    expect(byteRange("bytes=0-1,5-6", 100)).toBeNull();
  });
});
