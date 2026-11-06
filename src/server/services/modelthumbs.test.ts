import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { ModelSettings } from "../../shared/settings.ts";
import { realPng } from "../lib/test-images.ts";
import {
  dataDirOf,
  findPictures,
  moveFlatPictures,
  removeModelThumbs,
  saveModelThumbs,
  thumbSize,
} from "./modelthumbs.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-modelthumbs-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const A = "aaaaaaaaaaaa";
const B = "bbbbbbbbbbbb";

describe("model pictures", () => {
  it("finds global and scope pictures in thumbs/ of the folder named after the model", async () => {
    const model = path.join(tmp, "a", "Detailer.v2.safetensors");
    const dir = dataDirOf(model);
    expect(path.basename(dir)).toBe("Detailer.v2_data");
    expect((await findPictures(dir)).size).toBe(0);
    await fs.mkdir(path.join(dir, "thumbs"), { recursive: true });
    await fs.writeFile(path.join(dir, "model_data.json"), "{}");
    for (const name of [
      "GLOBAL.webp",
      "global_raw.mp4",
      `${B}+${A}.jpg`,
      `${A}_raw.png`,
      "thumbnail.jpg",
      `${A}.txt`,
    ])
      await fs.writeFile(path.join(dir, "thumbs", name), "x");
    const found = await findPictures(dir);
    expect(Object.fromEntries(found)).toEqual({
      global: {
        thumb: path.join(dir, "thumbs", "GLOBAL.webp"),
        raw: path.join(dir, "thumbs", "global_raw.mp4"),
      },
      // A combination's ids are read sorted, whatever order the file names them in.
      [`${A}+${B}`]: { thumb: path.join(dir, "thumbs", `${B}+${A}.jpg`), raw: null },
      [A]: { thumb: null, raw: path.join(dir, "thumbs", `${A}_raw.png`) },
    });
  });

  it("writes thumbs/global.jpg and global_raw.png, and keeps an existing picture unless replacing", async () => {
    const model = path.join(tmp, "b", "Style.safetensors");
    const dir = path.join(dataDirOf(model), "thumbs");
    expect(await saveModelThumbs(model, await realPng(1200, 1600), { replace: false })).toBe(true);
    const thumb = await sharp(path.join(dir, "global.jpg")).metadata();
    // 0.25 megapixels by default.
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["jpeg", 433, 577]);
    const raw = await sharp(path.join(dir, "global_raw.png")).metadata();
    expect([raw.format, raw.width]).toEqual(["png", 1200]);

    const before = await fs.readFile(path.join(dir, "global.jpg"));
    expect(await saveModelThumbs(model, await realPng(10, 10), { replace: false })).toBe(false);
    expect(await fs.readFile(path.join(dir, "global.jpg"))).toEqual(before);

    const trashDir = path.join(tmp, "trash");
    expect(await saveModelThumbs(model, await realPng(10, 10), { replace: true, trashDir })).toBe(
      true,
    );
    const [stamp] = await fs.readdir(trashDir);
    expect((await fs.readdir(path.join(trashDir, stamp ?? ""))).sort()).toEqual([
      "global.jpg",
      "global_raw.png",
    ]);
    expect(await fs.readFile(path.join(trashDir, stamp ?? "", "global.jpg"))).toEqual(before);
  });

  it("saves and removes a picture for a combination of scopes without touching the global one", async () => {
    const model = path.join(tmp, "s", "Skirt.safetensors");
    const dir = path.join(dataDirOf(model), "thumbs");
    await saveModelThumbs(model, await realPng(20, 20), { replace: false });
    await saveModelThumbs(model, await realPng(20, 20), { replace: false, key: `${B}+${A}` });
    expect((await fs.readdir(dir)).sort()).toEqual([
      `${A}+${B}.jpg`,
      `${A}+${B}_raw.png`,
      "global.jpg",
      "global_raw.png",
    ]);
    await expect(
      saveModelThumbs(model, await realPng(20, 20), { replace: false, key: "../x" }),
    ).rejects.toThrow();

    const trashDir = path.join(tmp, "trash-s");
    expect(await removeModelThumbs(model, `${A}+${B}`, trashDir)).toBe(2);
    expect(await removeModelThumbs(model, A, trashDir)).toBe(0);
    expect((await fs.readdir(dir)).sort()).toEqual(["global.jpg", "global_raw.png"]);
  });

  it("follows the picture settings: size, format, no original, animated kept as WebP", async () => {
    expect(thumbSize(100, 100, 1)).toEqual({ width: 100, height: 100 });
    const pictures = ModelSettings.parse({
      pictures: { megapixels: 0.05, format: "webp", keepRaw: false },
    }).pictures;
    const model = path.join(tmp, "c", "Look.safetensors");
    const thumbs = path.join(dataDirOf(model), "thumbs");
    await saveModelThumbs(model, await realPng(1000, 1000), { replace: false, pictures });
    expect(await fs.readdir(thumbs)).toEqual(["global.webp"]);
    const still = await sharp(path.join(thumbs, "global.webp")).metadata();
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
    const dir = path.join(dataDirOf(animatedModel), "thumbs");
    expect((await fs.readdir(dir)).sort()).toEqual(["global.webp", "global_raw.gif"]);
    const moving = await sharp(path.join(dir, "global.webp"), { animated: true }).metadata();
    expect(moving.pages).toBe(2);
  });

  it("moves the flat layout (thumb.*, thumb_raw.*) into thumbs/global.*, never over a picture", async () => {
    const dir = path.join(tmp, "flat", "Old_data");
    await fs.mkdir(dir, { recursive: true });
    for (const name of ["thumb.jpg", "thumb_raw.MP4", "model_data.json"])
      await fs.writeFile(path.join(dir, name), name);
    const result = await moveFlatPictures(dir);
    expect(result.moved.map((f) => path.basename(f)).sort()).toEqual([
      "thumb.jpg",
      "thumb_raw.MP4",
    ]);
    expect(result.skipped).toEqual([]);
    expect((await fs.readdir(dir)).sort()).toEqual(["model_data.json", "thumbs"]);
    expect((await fs.readdir(path.join(dir, "thumbs"))).sort()).toEqual([
      "global.jpg",
      "global_raw.mp4",
    ]);

    await fs.writeFile(path.join(dir, "thumb.jpg"), "newer");
    const again = await moveFlatPictures(dir);
    expect(again.moved).toEqual([]);
    expect(again.skipped).toEqual([path.join(dir, "thumb.jpg")]);
    expect(await fs.readFile(path.join(dir, "thumbs", "global.jpg"), "utf8")).toBe("thumb.jpg");
  });
});
