/**
 * Thumbnail cache (sharp). A thumbnail is keyed by its source path, a version (size + mtime)
 * and its size, so a changed file gets a new key and URLs can be cached forever. Files live in
 * runtime/cache/<profile>/thumbs/<area>/ and are safe to delete.
 *
 * Generation runs a few at a time and identical requests share one job. sharp's file cache is
 * off: on Windows libvips would keep source files open, which blocks renaming or trashing them.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { exists, writeFileAtomic } from "./fsx.ts";

sharp.cache(false);
sharp.concurrency(2);

const PARALLEL = 3;

export class ThumbCache {
  private readonly dir: string;
  private readonly inflight = new Map<string, Promise<string>>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(dir: string) {
    this.dir = dir;
  }

  keyFor(source: string, version: string, max: number): string {
    return createHash("sha1").update(`${source}\u0000${version}\u0000${max}`).digest("hex");
  }

  fileFor(key: string): string {
    return path.join(this.dir, key.slice(0, 2), `${key}.webp`);
  }

  /** Path of the cached WebP thumbnail, made on first request. */
  async get(source: string, version: string, max: number): Promise<string> {
    const key = this.keyFor(source, version, max);
    const file = this.fileFor(key);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    if (await exists(file)) return file;
    const job = this.make(source, file, max).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private async make(source: string, file: string, max: number): Promise<string> {
    if (this.running >= PARALLEL) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      const data = await sharp(source, { failOn: "none", animated: false, limitInputPixels: false })
        .rotate()
        .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 3 })
        .toBuffer();
      await writeFileAtomic(file, data);
      return file;
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
  }
}
