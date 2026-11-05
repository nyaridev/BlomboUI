/**
 * Reading gallery files for the index: walking a library's folders for the files it shows, and
 * what each one is (an image, an animation, a video or audio), its size, length and what it says
 * about how it was made (headers only, never pixels; sharp only for GIFs and odd formats). A
 * Civitai image adds its sidecar.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CIVITAI_SIDECAR,
  CivitaiSidecar,
  GALLERY_EXTENSIONS,
  type MediaKind,
  mediaOf,
  originOf,
} from "../../../shared/gallery.ts";
import { civitaiSummary, hasAirs, nameAirs } from "../../../shared/imageinfo.ts";
import { salvage } from "../../../shared/salvage.ts";
import { movePath } from "../../lib/fsx.ts";
import { readImageHead } from "../../lib/imagemeta.ts";
import { readMediaHead } from "../../lib/mediameta.ts";
import { parseMeta } from "./meta.ts";

const EXTENSIONS = new Set<string>(GALLERY_EXTENSIONS);

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Every image file under `dir` (hidden folders skipped). */
export async function walk(dir: string, out: string[], signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, signal);
    else if (e.isFile() && EXTENSIONS.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

export type IndexRow = Awaited<ReturnType<typeof readForIndex>>;

/** A Civitai image's sidecar, or null when it has none (or it's unreadable). */
export async function readSidecar(abs: string): Promise<CivitaiSidecar | null> {
  try {
    // Value by value, so a hand-edited or older file keeps what's still good in it.
    const read = salvage(
      CivitaiSidecar,
      JSON.parse(await fs.readFile(`${abs}${CIVITAI_SIDECAR}`, "utf8")),
    );
    return read.fixed.includes("*") ? null : read.data;
  } catch {
    return null;
  }
}

/** Move a Civitai image's sidecar along with it (trash, restore), when it has one. */
export async function moveSidecar(from: string, to: string): Promise<void> {
  try {
    await movePath(`${from}${CIVITAI_SIDECAR}`, `${to}${CIVITAI_SIDECAR}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Read what the index needs from one file (headers only; sharp only for odd formats). A Civitai
 * image adds its sidecar: the versions that made it and, when the file itself says nothing, how
 * the poster says it was made.
 */
/**
 * What the index keeps about a file. `local` gives local model names by Civitai version id, read
 * only when the file names models by AIR.
 */
export async function readForIndex(
  abs: string,
  rel: string,
  local?: () => Promise<Map<number, string>>,
) {
  let media: MediaKind = mediaOf(abs);
  let duration: number | null = null;
  let width: number | null;
  let height: number | null;
  let text: Record<string, string>;
  if (media === "image") {
    const head = await readImageHead(abs);
    ({ width, height, text } = head);
    const gif = /\.gif$/i.test(abs);
    if (!width || !height || gif || head.animated) {
      // GIFs, and animations' frame count and length, come from sharp's header read.
      const info = await sharp(abs, { failOn: "none", animated: true }).metadata();
      width = info.width ?? 0;
      height = info.pageHeight ?? info.height ?? 0;
      if ((info.pages ?? 1) > 1) {
        media = "animated";
        const delays = info.delay ?? [];
        duration = delays.length ? delays.reduce((a, b) => a + b, 0) / 1000 : null;
      }
    }
  } else {
    const head = await readMediaHead(abs);
    ({ text, duration } = head);
    // Audio has no picture: its tile is a square card.
    width = media === "audio" ? 1 : head.width;
    height = media === "audio" ? 1 : head.height;
    // A video whose size the header doesn't give still gets a tile (16:9 until it plays).
    if (media === "video" && (!width || !height)) [width, height] = [1280, 720];
  }
  if (!width || !height) throw new Error("No image size");
  const meta = parseMeta(text);
  const sidecar = originOf(rel) === "civitai" ? await readSidecar(abs) : null;
  if (sidecar?.meta && meta.summary.source === "none") {
    const shared = civitaiSummary(sidecar.meta);
    meta.summary = shared.summary;
    meta.settings = { workflowId: null, values: null, roles: shared.roles };
  }
  // Models named by Civitai AIR get a name: the local model's, else the one saved when it was added.
  if (hasAirs(meta.summary)) {
    const here = (await local?.().catch(() => null)) ?? new Map<number, string>();
    const names = sidecar?.names ?? {};
    meta.summary = nameAirs(meta.summary, (v) => here.get(v) ?? names[String(v)]);
  }
  return { width, height, ...meta, versions: sidecar?.versions ?? [], media, duration };
}
