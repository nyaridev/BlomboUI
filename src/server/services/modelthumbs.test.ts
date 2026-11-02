import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { realPng } from "../lib/test-images.ts";
import { dataDirOf, findThumbs, saveModelThumbs } from "./modelthumbs.ts";

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
    expect([thumb.format, thumb.width, thumb.height]).toEqual(["jpeg", 432, 576]);
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
});
