/**
 * Thumbnail cache (sharp). A thumbnail is keyed by its source path, a version (size + mtime)
 * and its size, so a changed file gets a new key and URLs can be cached forever. Files live in
 * runtime/cache/<profile>/thumbs/<area>/ and are safe to delete.
 *
 * Generation runs a few at a time and identical requests share one job. sharp's file cache is
 * off: on Windows libvips would keep source files open, which blocks renaming or trashing them.
 *
 * Modes: a still (an animation's first frame), an animated WebP (every frame, smaller), a video's
 * frame (through `ffmpeg` when it's on the PATH; without it, a plain card) and audio's card.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { exists, writeFileAtomic } from "./fsx.ts";

sharp.cache(false);
sharp.concurrency(2);

const PARALLEL = 3;

export type ThumbMode = "still" | "animated" | "video" | "audio";

/** A plain card for a file without a picture (audio, or a video when ffmpeg isn't there). */
function card(kind: "video" | "audio", max: number): Promise<Buffer> {
  const glyph =
    kind === "video"
      ? '<path d="M262 216v208l176-104z" fill="#9aa0b1"/>'
      : '<path d="M200 300v40M240 260v120M280 220v200M320 270v100M360 240v160M400 290v60M440 310v20" stroke="#9aa0b1" stroke-width="18" stroke-linecap="round"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#1b1e26"/>${glyph}</svg>`;
  return sharp(Buffer.from(svg))
    .resize({ width: max, height: max, fit: "inside" })
    .webp({ quality: 80 })
    .toBuffer();
}

/** ffmpeg isn't on the PATH (asked once). */
let noFfmpeg = false;

/** A PNG of a video's frame a moment in (the very first is often black), or null. */
function videoFrame(source: string, at: string): Promise<Buffer | null> {
  if (noFfmpeg) return Promise.resolve(null);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const args = ["-v", "error", "-ss", at, "-i", source, "-frames:v", "1"];
    const p = spawn("ffmpeg", [...args, "-f", "image2pipe", "-vcodec", "png", "pipe:1"], {
      windowsHide: true,
    });
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.on("error", () => {
      noFfmpeg = true;
      resolve(null);
    });
    p.on("close", () => resolve(chunks.length ? Buffer.concat(chunks) : null));
  });
}

export class ThumbCache {
  private readonly dir: string;
  private readonly inflight = new Map<string, Promise<string>>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(dir: string) {
    this.dir = dir;
  }

  keyFor(source: string, version: string, max: number, mode: ThumbMode = "still"): string {
    const extra = mode === "still" ? "" : `\u0000${mode}`;
    return createHash("sha1").update(`${source}\u0000${version}\u0000${max}${extra}`).digest("hex");
  }

  fileFor(key: string): string {
    return path.join(this.dir, key.slice(0, 2), `${key}.webp`);
  }

  /** Path of the cached WebP thumbnail, made on first request. */
  async get(
    source: string,
    version: string,
    max: number,
    mode: ThumbMode = "still",
  ): Promise<string> {
    const key = this.keyFor(source, version, max, mode);
    const file = this.fileFor(key);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    if (await exists(file)) return file;
    const job = this.make(source, file, max, mode).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private async make(source: string, file: string, max: number, mode: ThumbMode): Promise<string> {
    if (this.running >= PARALLEL) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      const data = await this.render(source, max, mode);
      await writeFileAtomic(file, data);
      return file;
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  private async render(source: string, max: number, mode: ThumbMode): Promise<Buffer> {
    if (mode === "audio") return card("audio", max);
    let input: string | Buffer = source;
    if (mode === "video") {
      const frame = (await videoFrame(source, "0.25")) ?? (await videoFrame(source, "0"));
      if (!frame) return card("video", max);
      input = frame;
    }
    if (mode === "animated") {
      // Every frame, scaled by the frame's size (sharp stacks them into one tall page).
      const img = sharp(source, { failOn: "none", animated: true, limitInputPixels: false });
      const meta = await img.metadata();
      const w = meta.width ?? max;
      const h = meta.pageHeight ?? meta.height ?? max;
      const scale = Math.min(1, max / w, max / h);
      return img
        .resize({ width: Math.max(1, Math.round(w * scale)) })
        .webp({ quality: 70, effort: 2 })
        .toBuffer();
    }
    return sharp(input, { failOn: "none", animated: false, limitInputPixels: false })
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .toBuffer();
  }

  async clear(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
  }
}
