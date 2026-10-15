import { describe, expect, it } from "vitest";
import { jsonAfter, readPngText, readWebpText } from "./imagemeta.ts";
import { concat, fakePng, latin1, utf8 } from "./test-images.ts";

describe("readPngText", () => {
  it("reads tEXt and compressed iTXt chunks", () => {
    const png = fakePng({ prompt: '{"1":{}}' }, { workflow: '{"nodes":[],"title":"café ✓"}' });
    expect(readPngText(png)).toEqual({
      prompt: '{"1":{}}',
      workflow: '{"nodes":[],"title":"café ✓"}',
    });
  });

  it("returns nothing for other files", () => {
    expect(readPngText(utf8("{}"))).toEqual({});
  });
});

describe("readWebpText", () => {
  it("finds ComfyUI's prompt and workflow strings in EXIF", () => {
    const exif = utf8(
      'II*\0junkprompt:{"3":{"class_type":"KSampler","inputs":{"t":"a}b"}}}\0workflow:{"nodes":[]}\0',
    );
    const body = concat(
      latin1("WEBP"),
      latin1("EXIF"),
      new Uint8Array([exif.byteLength, 0, 0, 0]),
      exif,
    );
    const riff = concat(latin1("RIFF"), new Uint8Array([body.byteLength, 0, 0, 0]), body);
    expect(readWebpText(riff)).toEqual({
      prompt: '{"3":{"class_type":"KSampler","inputs":{"t":"a}b"}}}',
      workflow: '{"nodes":[]}',
    });
  });
});

describe("jsonAfter", () => {
  it("balances braces and ignores ones inside strings", () => {
    expect(jsonAfter('x:{"a":"}{","b":{"c":1}} tail', "x:")).toBe('{"a":"}{","b":{"c":1}}');
    expect(jsonAfter("x: {}", "x:")).toBeNull();
  });
});
