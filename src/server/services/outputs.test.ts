/**
 * Saving outputs: a PNG converted to JPEG or WebP keeps its generation data and replaces the
 * PNG; a large image gets a JPEG copy where its pattern says; stopped runs' images and grids go
 * where their patterns say, grids numbered after the ones already there.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Settings } from "../../shared/settings.ts";
import { readImageHead } from "../lib/imagemeta.ts";
import { realPng } from "../lib/test-images.ts";
import { OutputSaver } from "./outputs.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-outputs-"));
const out = path.join(tmp, "outputs");
let settings = Settings.parse({});
const saver = new OutputSaver({
  profiles: {
    find: async () => ({ folders: { outputs: [{ path: out }] } }) as never,
    dir: () => path.join(tmp, "profile"),
  },
  settings: { get: async () => settings },
});
const vars = { workflow: "sdxl", date: "2026-11-06", seed: 7 };
const meta = { prompt: '{"3":{"inputs":{"text":"żółw 猫"}}}', workflow: '{"nodes":[]}' };

async function comfySaved(name: string): Promise<{ filename: string; subfolder: string }> {
  const subfolder = "sdxl/images/2026-11-06";
  await fs.mkdir(path.join(out, subfolder), { recursive: true });
  await fs.writeFile(path.join(out, subfolder, name), await realPng(64, 64, meta));
  return { filename: name, subfolder };
}

beforeAll(() => fs.mkdir(out, { recursive: true }));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("outputs", () => {
  it("leaves PNGs alone by default", async () => {
    const ref = await comfySaved("blombo_00001_.png");
    const saved = await saver.process("p", vars, { ...ref, type: "output", node: "9" });
    expect(saved.filename).toBe("blombo_00001_.png");
  });

  it("converts to WebP with the generation data, and copies a large image as JPEG", async () => {
    settings = Settings.parse({ saving: { format: "webp", jpegCopy: { overKb: 256 } } });
    const ref = await comfySaved("blombo_00002_.png");
    let saved = await saver.process("p", vars, { ...ref, type: "output", node: "9" });
    expect(saved.filename).toBe("blombo_00002_.webp");
    const dir = path.join(out, ref.subfolder);
    expect((await fs.readdir(dir)).sort()).toEqual(["blombo_00001_.png", "blombo_00002_.webp"]);
    const head = await readImageHead(path.join(dir, saved.filename));
    expect(head.format).toBe("webp");
    expect(JSON.parse(head.text.prompt ?? "{}")["3"].inputs.text).toBe("żółw 猫");
    expect(head.text.workflow).toBe(meta.workflow);

    // A tiny threshold can't be set, so pretend: any file over 0 KB counts.
    settings = Settings.parse({ saving: { format: "png", jpegCopy: { overKb: 256 } } });
    settings.saving.jpegCopy.overKb = 0;
    const big = await comfySaved("blombo_00003_.png");
    saved = await saver.process("p", vars, { ...big, type: "output", node: "9" });
    expect(saved.filename).toBe("blombo_00003_.png");
    const copy = path.join(out, "sdxl", "jpeg", "2026-11-06", "blombo_00003_.jpg");
    const copyHead = await readImageHead(copy);
    expect(copyHead.format).toBe("jpeg");
    expect(copyHead.text.workflow).toBe(meta.workflow);
  });

  it("puts stopped runs' images and grids where their patterns say", async () => {
    settings = Settings.parse({
      saving: {
        paths: { interrupted: "stopped/[workflow]/[name]-[seed]", grids: "grids/g_[number]" },
      },
    });
    expect(await saver.interruptedPath("p", vars, { filename: "blombo_00004_.png" })).toBe(
      "stopped/sdxl/blombo_00004_-7.png",
    );
    await fs.mkdir(path.join(out, "grids"), { recursive: true });
    await fs.writeFile(path.join(out, "grids", "g_00009.png"), "");
    const grid = await saver.gridTarget("p", vars, "jpeg");
    expect(path.relative(out, grid.file).replace(/\\/g, "/")).toBe("grids/g_00010.jpg");
    expect(grid.subfolder).toBe("grids");
  });
});
