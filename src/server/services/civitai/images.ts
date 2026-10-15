/**
 * The image proxy behind every Civitai picture Blombo shows: the client asks
 * /api/civitai/image?u=<url>, the server fetches the image once from Civitai's CDN, keeps it in
 * runtime/cache/civitai/images/ and serves it with immutable caching. Only Civitai's image hosts
 * may be fetched (checked at every redirect), only real image types are kept (a video or a page
 * is refused) and a few downloads run at a time.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { exists, writeFileAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { fetchFollow, RemoteError, readLimited, sniffImage } from "../../lib/remote.ts";

const PARALLEL = 6;
const MAX_BYTES = 20 * 1024 * 1024;
const MISS_MS = 5 * 60_000;
const TIMEOUT_MS = 30_000;

/** Civitai's image hosts (and the configured Civitai origin, for the fake one in checks). */
export function imageHostAllowed(url: URL, civitaiOrigin: string): boolean {
  if (url.origin === civitaiOrigin) return true;
  return (
    url.protocol === "https:" &&
    (url.hostname === "civitai.com" || url.hostname.endsWith(".civitai.com"))
  );
}

export class ImageProxy {
  private readonly dir: string;
  private readonly civitaiOrigin: string;
  private readonly doFetch: typeof fetch;
  private readonly inflight = new Map<string, Promise<{ file: string; type: string }>>();
  private readonly misses = new Map<string, number>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(opts: { dir: string; civitaiOrigin: string; fetch?: typeof fetch }) {
    this.dir = opts.dir;
    this.civitaiOrigin = opts.civitaiOrigin;
    this.doFetch = opts.fetch ?? fetch;
  }

  allowed(raw: string): boolean {
    try {
      return imageHostAllowed(new URL(raw), this.civitaiOrigin);
    } catch {
      return false;
    }
  }

  private fileFor(url: string): string {
    const key = createHash("sha1").update(url).digest("hex");
    return path.join(this.dir, key.slice(0, 2), `${key}.img`);
  }

  /** The cached file for an image URL (fetched on first use) and its type. */
  async get(url: string): Promise<{ file: string; type: string }> {
    if (!this.allowed(url)) throw new HttpError(400, "That image isn't from Civitai.", "bad_image");
    const file = this.fileFor(url);
    const pending = this.inflight.get(file);
    if (pending) return pending;
    const job = this.load(url, file).finally(() => this.inflight.delete(file));
    this.inflight.set(file, job);
    return job;
  }

  /** The image's bytes (downloads use it for a model's preview sidecar). */
  async bytes(url: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile((await this.get(url)).file));
  }

  private async load(url: string, file: string): Promise<{ file: string; type: string }> {
    if (await exists(file)) {
      const head = new Uint8Array(16);
      const handle = await fs.open(file, "r");
      try {
        await handle.read(head, 0, 16, 0);
      } finally {
        await handle.close();
      }
      const type = sniffImage(head);
      if (type) return { file, type };
    }
    const missed = this.misses.get(url);
    if (missed && Date.now() - missed < MISS_MS)
      throw new HttpError(404, "That image isn't available.", "no_image");
    if (this.running >= PARALLEL) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      const res = await fetchFollow(url, {
        allow: (u) => imageHostAllowed(u, this.civitaiOrigin),
        headers: { accept: "image/avif,image/webp,image/*;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        fetch: this.doFetch,
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        this.misses.set(url, Date.now());
        throw new HttpError(404, "That image isn't available.", "no_image");
      }
      const data = await readLimited(res, MAX_BYTES);
      const type = sniffImage(data);
      if (!type) {
        this.misses.set(url, Date.now());
        throw new HttpError(415, "That isn't an image Blombo shows.", "not_image");
      }
      await writeFileAtomic(file, data);
      return { file, type };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      this.misses.set(url, Date.now());
      throw new HttpError(
        502,
        error instanceof RemoteError ? error.message : "Couldn't load the image from Civitai.",
        "image_failed",
      );
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}
