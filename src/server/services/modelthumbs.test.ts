import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { ModelSettings } from "../../shared/settings.ts";
import { realPng } from "../lib/test-images.ts";
import { dataDirOf, findThumbs, saveModelThumbs, thumbSize } from "./modelthumbs.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-modelthumbs-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("model pictures", () => {
  it("finds thumb.* and thumb_raw.* in the folder named after the model", async () => {
    const model = path.join(tmp, "a", "Detailer.v2.safetensors");
    const dir = dataDirOf(model);
    expect(path.basename(dir)).toBe("Detailer.v2_data");
    expect(await findThumbs(dir)).toEqual({ thumb: null, raw: null });
    await fs.mkdir(dir, { recursive: true });
    for (const name of ["THUMB.webp", "thumb_raw.mp4", "model_data.json", "thumbnail.jpg"])
      await fs.writeFile(path.join(dir, name), "x");
    expect(await findThumbs(dir)).toEqual({
      thumb: path.join(dir, "THUMB.webp"),
      raw: path.join(dir, "thumb_raw.mp4"),
    });
  });

  it("writes thumb.jpg and thumb_raw.png, and keeps an existing picture unless replacing", async () => {
    const model = path.join(tmp, "b", "Style.safetensors");
    const dir = dataDirOf(model);
    expect(await saveModelThumbs(model, await realPng(1200, 1600), { replace: false })).toBe(true);
    const thumb = await sharp(path.join(dir, "thumb.jpg")).metadata();
    // 0.25 megapixels by default.
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["jpeg", 433, 577]);
    const raw = await sharp(path.join(dir, "thumb_raw.png")).metadata();
    expect([raw.format, raw.width]).toEqual(["png", 1200]);

    const before = await fs.readFile(path.join(dir, "thumb.jpg"));
    expect(await saveModelThumbs(model, await realPng(10, 10), { replace: false })).toBe(false);
    expect(await fs.readFile(path.join(dir, "thumb.jpg"))).toEqual(before);

    const trashDir = path.join(tmp, "trash");
    expect(await saveModelThumbs(model, await realPng(10, 10), { replace: true, trashDir })).toBe(
      true,
    );
    const [stamp] = await fs.readdir(trashDir);
    expect((await fs.readdir(path.join(trashDir, stamp ?? ""))).sort()).toEqual([
      "thumb.jpg",
      "thumb_raw.png",
    ]);
    expect(await fs.readFile(path.join(trashDir, stamp ?? "", "thumb.jpg"))).toEqual(before);
  });

  it("follows the picture settings: size, format, no original, animated kept as WebP", async () => {
    expect(thumbSize(100, 100, 1)).toEqual({ width: 100, height: 100 });
    const pictures = ModelSettings.parse({
      pictures: { megapixels: 0.05, format: "webp", keepRaw: false },
    }).pictures;
    const model = path.join(tmp, "c", "Look.safetensors");
    await saveModelThumbs(model, await realPng(1000, 1000), { replace: false, pictures });
    expect(await fs.readdir(dataDirOf(model))).toEqual(["thumb.webp"]);
    const still = await sharp(path.join(dataDirOf(model), "thumb.webp")).metadata();
    expect([still.width, still.height]).toEqual([224, 224]);

    // A two-frame GIF stays animated, its original kept as it came.
    const frame = (c: string) =>
      sharp({ create: { width: 40, height: 40, channels: 3, background: c } })
        .raw()
        .toBuffer();
    const gif = await sharp(Buffer.concat([await frame("#f00"), await frame("#00f")]), {
      raw: { width: 40, height: 80, channels: 3, pageHeight: 40 },
    } as never)
      .gif()
      .toBuffer();
    const animatedModel = path.join(tmp, "d", "Moving.safetensors");
    await saveModelThumbs(animatedModel, gif, {
      replace: false,
      pictures: ModelSettings.parse({}).pictures,
    });
    const dir = dataDirOf(animatedModel);
    expect((await fs.readdir(dir)).sort()).toEqual(["thumb.webp", "thumb_raw.gif"]);
    const moving = await sharp(path.join(dir, "thumb.webp"), { animated: true }).metadata();
    expect(moving.pages).toBe(2);
  });
});
