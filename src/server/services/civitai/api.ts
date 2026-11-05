/**
 * Civitai's public REST API (v1), as the server uses it. Responses are cached in memory and in
 * runtime/cache/civitai/api/ (safe to delete) so browsing back and forth, reopening a model or
 * restarting the app doesn't ask Civitai again; the cache key includes which API key asked, so
 * one profile's results never show up for another. Errors become HttpErrors that say what to do.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowseFilter } from "../../../shared/civitai.ts";
import { writeJsonAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { fetchFollow, USER_AGENT } from "../../lib/remote.ts";

/* ── Civitai's shapes (only the fields Blombo reads; everything optional) ─── */

export interface RawImage {
  url?: string;
  nsfwLevel?: number;
  nsfw?: boolean | string;
  width?: number;
  height?: number;
  type?: string;
  username?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface RawFile {
  id?: number;
  name?: string;
  sizeKB?: number;
  type?: string;
  metadata?: { format?: string | null; fp?: string | null; size?: string | null };
  pickleScanResult?: string;
  virusScanResult?: string;
  hashes?: Record<string, string>;
  downloadUrl?: string;
  primary?: boolean;
}

export interface RawVersion {
  id: number;
  modelId?: number;
  name?: string;
  baseModel?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  trainedWords?: string[];
  description?: string | null;
  stats?: { downloadCount?: number };
  files?: RawFile[];
  images?: RawImage[];
  downloadUrl?: string;
  availability?: string;
  earlyAccessEndsAt?: string | null;
  model?: { name?: string; type?: string; nsfw?: boolean; poi?: boolean };
}

export interface RawModel {
  id: number;
  name?: string;
  description?: string | null;
  type?: string;
  nsfw?: boolean;
  nsfwLevel?: number;
  tags?: string[];
  creator?: { username?: string | null; image?: string | null } | null;
  stats?: {
    downloadCount?: number;
    thumbsUpCount?: number;
    favoriteCount?: number;
    commentCount?: number;
    collectedCount?: number;
    imageCount?: number;
    rating?: number;
  };
  modelVersions?: RawVersion[];
}

/** A model as Civitai's own site search (`model.getAll`) answers: its newest version only. */
export interface SiteModel {
  id: number;
  name?: string;
  type?: string;
  nsfw?: boolean;
  nsfwLevel?: number;
  publishedAt?: string | null;
  user?: { username?: string | null } | null;
  rank?: { downloadCount?: number | null; thumbsUpCount?: number | null } | null;
  version?: { id: number; name?: string; baseModel?: string | null } | null;
  /** `url` is an image id on Civitai's image host, or a full address. */
  images?: Array<{ id?: number; url?: string; type?: string; nsfwLevel?: number }>;
}

/** A tRPC answer (superjson): the value in `json`, the types of special values in `meta`. */
interface SiteAnswer {
  result?: {
    data?: {
      json?: { items?: SiteModel[]; nextCursor?: unknown };
      meta?: { values?: { nextCursor?: unknown } };
    };
  };
}

/** Civitai's image host account, the path every image id sits under. */
const IMAGE_ACCOUNT = "xG1nkqKTMzGDvpLrqFT7WA";
/** Every browsing level (PG to XXX); the profile's site decides what it answers with. */
const ALL_LEVELS = 31;

/** A site-search model in the public API's shape, so the same cards come out of it. */
export function fromSite(m: SiteModel, imageEdge: string): RawModel {
  const v = m.version;
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    nsfw: m.nsfw,
    nsfwLevel: m.nsfwLevel,
    creator: { username: m.user?.username ?? null },
    stats: {
      downloadCount: m.rank?.downloadCount ?? undefined,
      thumbsUpCount: m.rank?.thumbsUpCount ?? undefined,
    },
    modelVersions: v
      ? [
          {
            id: v.id,
            name: v.name,
            baseModel: v.baseModel,
            publishedAt: m.publishedAt,
            images: (m.images ?? []).flatMap((img) => {
              if (!img.url) return [];
              const video = img.type === "video";
              const url = /^https?:\/\//i.test(img.url)
                ? img.url
                : `${imageEdge}/${encodeURIComponent(img.url)}/original=true/${img.id ?? "image"}.${video ? "mp4" : "jpeg"}`;
              return [{ url, type: img.type, nsfwLevel: img.nsfwLevel }];
            }),
          },
        ]
      : [],
  };
}

export interface RawPage {
  items?: RawModel[];
  metadata?: { nextCursor?: string | number | null; nextPage?: string | null };
}

/* ── client ────────────────────────────────────────────────────────────── */

export const SEARCH_TTL = 10 * 60_000;
/** Civitai's lists of names (base models, types) change rarely. */
export const ENUMS_TTL = 24 * 3600_000;
export const MODEL_TTL = 30 * 60_000;
const MEMORY_ENTRIES = 300;
const TIMEOUT_MS = 20_000;
export const PAGE_SIZE = 40;

export interface CivitaiApiOptions {
  /** "https://civitai.com" to start with, or the fake server's address. */
  baseUrl: string;
  /** runtime/cache/civitai/api */
  cacheDir: string;
  fetch?: typeof fetch;
}

export class CivitaiApi {
  baseUrl: string;
  origin: string;
  private readonly cacheDir: string;
  private readonly doFetch: typeof fetch;
  private readonly memory = new Map<string, { at: number; body: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(opts: CivitaiApiOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.origin = new URL(this.baseUrl).origin;
    this.cacheDir = opts.cacheDir;
    this.doFetch = opts.fetch ?? fetch;
  }

  /** Switch to the other Civitai site. Cached answers are kept per site (`cacheKey`). */
  setSite(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.origin = new URL(this.baseUrl).origin;
  }

  /** One page of models. `cursor` comes from the previous page. */
  async models(filter: BrowseFilter, cursor: string | null, key: string | null): Promise<RawPage> {
    const q = new URLSearchParams();
    q.set("limit", String(PAGE_SIZE));
    if (filter.query) q.set("query", filter.query);
    for (const t of filter.types) q.append("types", t);
    for (const b of filter.baseModels) q.append("baseModels", b);
    q.set("sort", filter.sort);
    q.set("period", filter.period);
    // Always asked for: the profile's site decides (civitai.com answers SFW models only).
    q.set("nsfw", "true");
    if (filter.username) q.set("username", filter.username);
    if (filter.tag) q.set("tag", filter.tag);
    if (cursor?.startsWith("p:")) q.set("page", cursor.slice(2));
    else if (cursor) q.set("cursor", cursor);
    return this.get<RawPage>(`/api/v1/models?${q}`, key, SEARCH_TTL);
  }

  /**
   * One page of models published in a date range, from Civitai's own site search (`model.getAll`
   * over tRPC): the public API has no date filter. It needs the API key and isn't documented, so
   * it can change without notice; its answer is turned into the public API's shape here. Its
   * cursor comes back typed (a bigint, say), so Blombo's cursor carries the value and its type.
   */
  async modelsByDate(filter: BrowseFilter, cursor: string | null, key: string): Promise<RawPage> {
    const input: Record<string, unknown> = {
      limit: PAGE_SIZE,
      sort: filter.sort,
      period: filter.period,
      publishedFrom: filter.publishedFrom,
      publishedTo: filter.publishedTo,
      browsingLevel: ALL_LEVELS,
    };
    if (filter.query) input.query = filter.query;
    if (filter.types.length) input.types = filter.types;
    if (filter.baseModels.length) input.baseModels = filter.baseModels;
    if (filter.username) input.username = filter.username;
    if (filter.tag) input.tag = filter.tag;
    let meta: unknown;
    if (cursor?.startsWith("t:")) {
      try {
        const token = JSON.parse(Buffer.from(cursor.slice(2), "base64url").toString("utf8")) as {
          c?: unknown;
          m?: unknown;
        };
        input.cursor = token.c;
        if (token.m !== undefined) meta = { values: { cursor: token.m } };
      } catch {
        // A cursor from somewhere else: start from the first page.
      }
    }
    const q = encodeURIComponent(JSON.stringify(meta ? { json: input, meta } : { json: input }));
    const body = await this.get<SiteAnswer>(`/api/trpc/model.getAll?input=${q}`, key, SEARCH_TTL);
    const data = body.result?.data;
    const next = data?.json?.nextCursor;
    const items = (data?.json?.items ?? []).filter((m) => typeof m?.id === "number");
    const edge = this.imageEdge();
    return {
      items: items.map((m) => fromSite(m, edge)),
      metadata: {
        nextCursor:
          next === undefined || next === null || next === ""
            ? null
            : `t:${Buffer.from(JSON.stringify({ c: next, m: data?.meta?.values?.nextCursor })).toString("base64url")}`,
      },
    };
  }

  /**
   * Where the site search's image ids are served: image.civitai.com for both Civitai sites
   * (civitai.red's own API links there too; image.civitai.red doesn't exist), the server itself
   * for the fake one.
   */
  imageEdge(): string {
    const host = new URL(this.baseUrl).hostname.replace(/^www\./, "");
    return /^civitai\.(com|red)$/.test(host)
      ? `https://image.civitai.com/${IMAGE_ACCOUNT}`
      : `${this.origin}/img`;
  }

  /** Civitai's lists of names: base models (all, and the ones its filter offers), types. */
  enums(): Promise<{ ActiveBaseModel?: unknown; BaseModel?: unknown }> {
    return this.get("/api/v1/enums", null, ENUMS_TTL);
  }

  model(id: number, key: string | null): Promise<RawModel> {
    return this.get<RawModel>(`/api/v1/models/${id}`, key, MODEL_TTL);
  }

  version(id: number, key: string | null): Promise<RawVersion> {
    return this.get<RawVersion>(`/api/v1/model-versions/${id}`, key, MODEL_TTL);
  }

  /** The version a file belongs to, by its SHA256; null when Civitai doesn't know it. */
  async byHash(sha256: string, signal?: AbortSignal): Promise<RawVersion | null> {
    try {
      return await this.request<RawVersion>(
        `/api/v1/model-versions/by-hash/${encodeURIComponent(sha256)}`,
        null,
        signal,
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }

  /** Who a key belongs to; throws a 400 HttpError when Civitai refuses it. */
  async me(key: string): Promise<{ username: string | null }> {
    try {
      const body = await this.request<{ username?: string; name?: string }>("/api/v1/me", key);
      return { username: body.username ?? body.name ?? null };
    } catch (error) {
      if (error instanceof HttpError && error.code === "civitai_auth")
        throw new HttpError(
          400,
          `Civitai didn't accept that key. Copy it again from ${new URL(this.baseUrl).host} → Account settings → API keys.`,
          "civitai_bad_key",
        );
      throw error;
    }
  }

  /** The next page's cursor from a page's metadata ("p:3" for page-numbered results). */
  static nextCursor(page: RawPage): string | null {
    const meta = page.metadata;
    if (!meta) return null;
    if (meta.nextCursor !== undefined && meta.nextCursor !== null && meta.nextCursor !== "")
      return String(meta.nextCursor);
    if (meta.nextPage) {
      try {
        const next = new URL(meta.nextPage);
        const cursor = next.searchParams.get("cursor");
        if (cursor) return cursor;
        const page = next.searchParams.get("page");
        if (page) return `p:${page}`;
      } catch {
        return null;
      }
    }
    return null;
  }

  /* ── cache ──────────────────────────────────────────────────────────── */

  private cacheKey(pathAndQuery: string, key: string | null): string {
    const who = key ? createHash("sha1").update(key).digest("hex").slice(0, 10) : "anon";
    return createHash("sha1").update(`${this.baseUrl}${pathAndQuery}\u0000${who}`).digest("hex");
  }

  private cacheFile(hash: string): string {
    return path.join(this.cacheDir, hash.slice(0, 2), `${hash}.json`);
  }

  private async get<T>(pathAndQuery: string, key: string | null, ttl: number): Promise<T> {
    const hash = this.cacheKey(pathAndQuery, key);
    const now = Date.now();
    const hit = this.memory.get(hash);
    if (hit && now - hit.at < ttl) return hit.body as T;
    const pending = this.inflight.get(hash);
    if (pending) return pending as Promise<T>;
    const job = (async () => {
      const disk = await fs
        .readFile(this.cacheFile(hash), "utf8")
        .then((text) => JSON.parse(text) as { at: number; body: T })
        .catch(() => null);
      if (disk && now - disk.at < ttl) {
        this.remember(hash, disk.at, disk.body);
        return disk.body;
      }
      const body = await this.request<T>(pathAndQuery, key);
      this.remember(hash, Date.now(), body);
      void writeJsonAtomic(this.cacheFile(hash), { at: Date.now(), body }).catch(() => undefined);
      return body;
    })().finally(() => this.inflight.delete(hash));
    this.inflight.set(hash, job);
    return job;
  }

  private remember(hash: string, at: number, body: unknown): void {
    this.memory.delete(hash);
    this.memory.set(hash, { at, body });
    if (this.memory.size > MEMORY_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest) this.memory.delete(oldest);
    }
  }

  /** Forget cached answers (after saving a new API key, results may differ). */
  clearMemory(): void {
    this.memory.clear();
  }

  /* ── requests ───────────────────────────────────────────────────────── */

  private async request<T>(
    pathAndQuery: string,
    key: string | null,
    signal?: AbortSignal,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchFollow(`${this.baseUrl}${pathAndQuery}`, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        auth: key ? { origin: this.origin, header: `Bearer ${key}` } : undefined,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        fetch: this.doFetch,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new HttpError(
        502,
        timeout.aborted
          ? "Civitai took too long to answer. Try again in a moment."
          : "Can't reach Civitai. Check your internet connection, then try again.",
        "civitai_down",
      );
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new HttpError(502, "Civitai sent an answer Blombo couldn't read.", "civitai_bad");
      }
    }
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown };
      // The site search (tRPC) puts its message in error.json.message.
      const trpc = (body.error as { json?: { message?: unknown } } | undefined)?.json?.message;
      detail =
        typeof body.error === "string"
          ? body.error
          : typeof trpc === "string"
            ? trpc
            : String(body.message ?? "");
    } catch {
      detail = "";
    }
    if (res.status === 401 || res.status === 403)
      throw new HttpError(
        401,
        key
          ? "Civitai refused your API key. Check it in Settings → Civitai."
          : "Civitai needs an API key for this. Add yours in Settings → Civitai.",
        "civitai_auth",
      );
    if (res.status === 404)
      throw new HttpError(404, detail || "Civitai doesn't have that anymore.", "civitai_not_found");
    if (res.status === 429)
      throw new HttpError(
        429,
        "Civitai asked Blombo to slow down. Wait a minute, then try again.",
        "civitai_busy",
      );
    throw new HttpError(
      502,
      `Civitai had a problem (${res.status}${detail ? `: ${detail}` : ""}). Try again later.`,
      "civitai_down",
    );
  }
}
