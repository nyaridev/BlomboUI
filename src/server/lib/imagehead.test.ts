import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readImageHeadBytes } from "./imagemeta.ts";
import { realPng } from "./test-images.ts";

const base = () =>
  sharp({ create: { width: 33, height: 21, channels: 3, background: { r: 1, g: 2, b: 3 } } });

describe("readImageHead", () => {
  it("reads PNG size and text chunks", async () => {
    const head = await readImageHeadBytes(await realPng(40, 30, { parameters: "a cat\nSteps: 5" }));
    expect(head).toEqual({
      format: "png",
      width: 40,
      height: 30,
      text: { parameters: "a cat\nSteps: 5" },
    });
  });

  it("reads ComfyUI-style strings from WebP EXIF", async () => {
    const webp = await base()
      .webp()
      .withExif({
        IFD0: {
          Make: 'prompt:{"1":{"class_type":"X","inputs":{}}}',
          Model: 'workflow:{"nodes":[]}',
        },
      })
      .toBuffer();
    const head = await readImageHeadBytes(new Uint8Array(webp));
    expect(head.format).toBe("webp");
    expect([head.width, head.height]).toEqual([33, 21]);
    expect(head.text.prompt).toBe('{"1":{"class_type":"X","inputs":{}}}');
    expect(head.text.workflow).toBe('{"nodes":[]}');
  });

  it("reads lossless and lossy WebP sizes", async () => {
    for (const lossless of [true, false]) {
      const head = await readImageHeadBytes(
        new Uint8Array(await base().webp({ lossless }).toBuffer()),
      );
      expect([head.width, head.height]).toEqual([33, 21]);
    }
  });

  it("reads JPEG size and the EXIF user comment", async () => {
    const jpg = await base()
      .jpeg()
      .withExif({ IFD2: { UserComment: "Steps: 20, Seed: 5" } })
      .toBuffer();
    const head = await readImageHeadBytes(new Uint8Array(jpg));
    expect(head.format).toBe("jpeg");
    expect([head.width, head.height]).toEqual([33, 21]);
    expect(head.text.parameters).toBe("Steps: 20, Seed: 5");
  });

  it("says other files are other", async () => {
    expect((await readImageHeadBytes(new TextEncoder().encode("hello"))).format).toBe("other");
  });
});
