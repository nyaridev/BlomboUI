/**
 * The Civitai service: the profile's account (API key in secrets.json, checked with Civitai),
 * browsing through the cached API client, model pages with "installed" marks from the models
 * folder, and the browse and search history in the profile's database.
 */

import { KNOWN_BASE_MODELS } from "../../../shared/basemodels.ts";
import {
  BrowseFilter,
  type CivitaiAccount,
  type CivitaiBaseModels,
  CivitaiCreator,
  CivitaiImage,
  type CivitaiImagePage,
  type CivitaiMatch,
  type CivitaiModel,
  type CivitaiPage,
  type CivitaiSearch,
  type CivitaiSort,
  type CivitaiView,
  type CommunityQuery,
  dateRangeProblem,
  type LocalMark,
  mergeFeed,
} from "../../../shared/civitai.ts";
import type { LocalModel } from "../../../shared/models.ts";
import type { ProfileDbs } from "../../db/profileDb.ts";
import { HttpError } from "../../lib/http.ts";
import type { ModelService } from "../models.ts";
import type { ProfileService } from "../profiles.ts";
import type { SettingsService } from "../settings.ts";
import { CivitaiApi, type RawModel, type RawPage, type RawVersion } from "./api.ts";
import type { ImageProxy } from "./images.ts";
import * as normalize from "./normalize.ts";

export interface CivitaiDeps {
  profiles: ProfileService;
  settings: SettingsService;
  models: ModelService;
  dbs: ProfileDbs;
  api: CivitaiApi;
  images: ImageProxy;
}

/** The number each sort orders by, from a model's stats (Newest and Oldest go by date). */
const SORT_STAT: Partial<
  Record<CivitaiSort, (s: NonNullable<RawModel["stats"]>) => number | undefined>
> = {
  "Highest Rated": (s) => s.thumbsUpCount ?? s.rating,
  "Most Downloaded": (s) => s.downloadCount,
  "Most Liked": (s) => s.thumbsUpCount ?? s.favoriteCount,
  "Most Discussed": (s) => s.commentCount,
  "Most Collected": (s) => s.collectedCount ?? s.favoriteCount,
  "Most Images": (s) => s.imageCount,
};

export class CivitaiService {
  readonly api: CivitaiApi;
  readonly images: ImageProxy;
  private readonly deps: CivitaiDeps;
  private marks: { scannedAt: number; byModel: Map<number, Set<number>> } | null = null;

  constructor(deps: CivitaiDeps) {
    this.deps = deps;
    this.api = deps.api;
    this.images = deps.images;
  }

  private active(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  /** The profile's API key, or null. Server-side only. */
  async key(profileId: string): Promise<string | null> {
    return (await this.deps.profiles.secrets(profileId)).civitai.key;
  }

  get site(): string {
    return this.api.baseUrl;
  }

  allowedImage = (url: string): boolean => this.images.allowed(url);

  /* ── account ─────────────────────────────────────────────────────────── */

  async account(): Promise<CivitaiAccount> {
    const { civitai } = await this.deps.profiles.secrets(this.active());
    return {
      keySet: Boolean(civitai.key),
      keyHint: civitai.key ? civitai.key.slice(-4) : null,
      username: civitai.username,
      checkedAt: civitai.checkedAt,
    };
  }

  async setKey(key: string, check: boolean): Promise<CivitaiAccount> {
    const profileId = this.active();
    const username = check ? (await this.api.me(key)).username : null;
    await this.deps.profiles.updateSecrets(profileId, {
      civitai: { key, username, checkedAt: check ? new Date().toISOString() : null },
    });
    this.api.clearMemory();
    return this.account();
  }

  async removeKey(): Promise<CivitaiAccount> {
    await this.deps.profiles.updateSecrets(this.active(), {
      civitai: { key: null, username: null, checkedAt: null },
    });
    this.api.clearMemory();
    return this.account();
  }

  /* ── browsing ────────────────────────────────────────────────────────── */

  private async context(): Promise<normalize.NormalizeContext> {
    const byModel = await this.localIndex();
    return {
      allowed: this.allowedImage,
      site: this.site,
      local: (modelId, latest) => {
        const versions = byModel.get(modelId);
        if (!versions?.size) return null;
        const mark: LocalMark = {
          versions: [...versions],
          latest: latest !== null && versions.has(latest),
        };
        return mark;
      },
    };
  }

  /** Civitai model id → version ids in the models folder (sidecars and lookups by hash). */
  private async localIndex(): Promise<Map<number, Set<number>>> {
    let list: { models: LocalModel[]; scannedAt: number };
    try {
      list = await this.deps.models.list();
    } catch {
      return new Map();
    }
    if (this.marks?.scannedAt === list.scannedAt) return this.marks.byModel;
    const byModel = new Map<number, Set<number>>();
    for (const m of list.models) {
      if (!m.civitai) continue;
      const set = byModel.get(m.civitai.modelId) ?? new Set<number>();
      set.add(m.civitai.versionId);
      byModel.set(m.civitai.modelId, set);
    }
    this.marks = { scannedAt: list.scannedAt, byModel };
    return byModel;
  }

  /** One page from Civitai: the public API, or its site search for a published-date range. */
  private page(filter: BrowseFilter, cursor: string | null, key: string | null): Promise<RawPage> {
    if (!filter.publishedFrom && !filter.publishedTo) return this.api.models(filter, cursor, key);
    const problem = dateRangeProblem(filter.publishedFrom, filter.publishedTo);
    if (problem) throw new HttpError(400, problem, "bad_dates");
    if (!key)
      throw new HttpError(
        400,
        "Searching by date needs your Civitai API key. Add it in Settings → Civitai.",
        "civitai_needs_key",
      );
    return this.api.modelsByDate(filter, cursor, key);
  }

  async search(filter: BrowseFilter, cursor: string | null): Promise<CivitaiPage> {
    const profileId = this.active();
    const key = await this.key(profileId);
    const page = await this.page(filter, cursor, key);
    const ctx = await this.context();
    if (filter.query && !cursor) await this.recordSearch(profileId, filter.query);
    return {
      items: (page.items ?? [])
        .filter((m) => typeof m?.id === "number")
        .map((m) => normalize.card(m, ctx, filter.baseModels)),
      nextCursor: (page.items?.length ?? 0) > 0 ? CivitaiApi.nextCursor(page) : null,
    };
  }

  /**
   * The Following feed: each creator's first page in the filter's order, merged by that order
   * (the sorts by a number compare the models' stats: downloads, likes, comments…).
   * shortcut: one page (40) per creator, no "load more"; picking a creator lists all of theirs.
   * Asks Civitai four creators at a time; a creator Civitai can't answer for is left out, unless
   * none answer.
   */
  async feed(users: string[], filter: BrowseFilter): Promise<CivitaiPage> {
    const key = await this.key(this.active());
    const ctx = await this.context();
    const pages: CivitaiPage["items"][] = [];
    const scores = new Map<number, number>();
    const stat = SORT_STAT[filter.sort];
    let failure: unknown = null;
    for (let i = 0; i < users.length; i += 4)
      await Promise.all(
        users.slice(i, i + 4).map(async (username) => {
          try {
            const page = await this.page({ ...filter, username }, null, key);
            const models = (page.items ?? []).filter((m) => typeof m?.id === "number");
            if (stat) for (const m of models) scores.set(m.id, stat(m.stats ?? {}) ?? 0);
            pages.push(models.map((m) => normalize.card(m, ctx, filter.baseModels)));
          } catch (error) {
            failure ??= error;
          }
        }),
      );
    if (!pages.length && failure) throw failure;
    return {
      items: mergeFeed(pages, filter.sort, (c) => scores.get(c.id) ?? 0),
      nextCursor: null,
    };
  }

  /**
   * Who a username is on Civitai: their name as Civitai spells it and their picture, read from
   * their newest model (the search is cached like any other). Null when Civitai has no models by
   * that name. A followed creator's entry in settings takes the answer, so their avatar shows from
   * then on without asking again (the picture itself stays in the image proxy's cache).
   */
  async refreshCreator(username: string): Promise<CivitaiCreator | null> {
    const profileId = this.active();
    let page: RawPage;
    try {
      page = await this.api.models(
        BrowseFilter.parse({ username, sort: "Newest" }),
        null,
        await this.key(profileId),
      );
    } catch (error) {
      // Civitai answers an unknown name with an error on some sites and an empty page on others.
      if (error instanceof HttpError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    }
    const raw = (page.items ?? []).find(
      (m) => m.creator?.username?.toLowerCase() === username.toLowerCase(),
    );
    if (!raw) return null;
    const found = CivitaiCreator.safeParse({
      username: raw.creator?.username,
      image: normalize.creatorImage(raw, { allowed: this.allowedImage }),
    });
    if (!found.success) return null;
    const same = (u: string) => u.toLowerCase() === username.toLowerCase();
    await this.deps.settings.updateWith(profileId, (current) => {
      const list = current.civitai.following;
      if (!list.some((f) => same(f.username))) return {};
      return {
        civitai: { following: list.map((f) => (same(f.username) ? found.data : f)) },
      };
    });
    return found.data;
  }

  async rawModel(id: number): Promise<RawModel> {
    return this.api.model(id, await this.key(this.active()));
  }

  async rawVersion(id: number): Promise<RawVersion> {
    return this.api.version(id, await this.key(this.active()));
  }

  /**
   * A version's images from its own answer: unlike the model answer's, they say who posted each
   * one and how it was made (the model page's image settings).
   */
  async versionImages(id: number): Promise<CivitaiImage[]> {
    return normalize.version(await this.rawVersion(id), await this.context()).images;
  }

  /** A page of images people posted with a version (the model page's grid). */
  async communityImages(versionId: number, query: CommunityQuery): Promise<CivitaiImagePage> {
    const page = await this.api.images(versionId, query, await this.key(this.active()));
    const ctx = await this.context();
    const raw = page.items ?? [];
    const next = page.metadata?.nextCursor;
    return {
      items: raw.flatMap((img) => {
        const out = normalize.image(img, ctx);
        return out ? [out] : [];
      }),
      nextCursor:
        raw.length && next !== undefined && next !== null && next !== "" ? String(next) : null,
    };
  }

  /** A model page; opening one adds it to the browse history. */
  async model(id: number): Promise<CivitaiModel> {
    const profileId = this.active();
    const raw = await this.rawModel(id);
    const out = normalize.model(raw, await this.context());
    this.recordView(profileId, out);
    return out;
  }

  /**
   * The model a file belongs to, by one of its hashes (SHA256, AutoV1–V3; File Info). Not added
   * to the browse history. The version's images come from the by-hash answer, which carries who
   * posted each one and how it was made.
   */
  async byHash(hash: string): Promise<CivitaiMatch> {
    this.active();
    const raw = await this.api.byHash(hash);
    if (!raw?.modelId) return null;
    const ctx = await this.context();
    const model = normalize.model(await this.rawModel(raw.modelId), ctx);
    const images = normalize.version(raw, ctx).images;
    if (images.length)
      model.versions = model.versions.map((v) => (v.id === raw.id ? { ...v, images } : v));
    return { model, versionId: raw.id };
  }

  /* ── history ─────────────────────────────────────────────────────────── */

  private recordView(profileId: string, m: CivitaiModel): void {
    try {
      const { db } = this.deps.dbs.get(profileId);
      const image = m.versions[0]?.images[0] ?? null;
      db.prepare(
        `INSERT INTO civitai_views (model_id, name, type, creator, image, viewed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (model_id) DO UPDATE SET name = excluded.name, type = excluded.type,
           creator = excluded.creator, image = excluded.image, viewed_at = excluded.viewed_at`,
      ).run(m.id, m.name, m.type, m.creator, image ? JSON.stringify(image) : null, Date.now());
      void this.trim(profileId);
    } catch (error) {
      console.warn("Couldn't save the browse history:", error);
    }
  }

  private async recordSearch(profileId: string, query: string): Promise<void> {
    const limit = (await this.deps.settings.get(profileId)).civitai.history.searches;
    try {
      const { db } = this.deps.dbs.get(profileId);
      if (limit === 0) return;
      db.prepare(
        `INSERT INTO civitai_searches (query, at) VALUES (?, ?)
         ON CONFLICT (query) DO UPDATE SET at = excluded.at`,
      ).run(query.trim(), Date.now());
      db.prepare(
        `DELETE FROM civitai_searches WHERE query NOT IN
           (SELECT query FROM civitai_searches ORDER BY at DESC LIMIT ?)`,
      ).run(limit);
    } catch (error) {
      console.warn("Couldn't save the search history:", error);
    }
  }

  private async trim(profileId: string): Promise<void> {
    const limit = (await this.deps.settings.get(profileId)).civitai.history.views;
    this.deps.dbs
      .get(profileId)
      .db.prepare(
        `DELETE FROM civitai_views WHERE model_id NOT IN
           (SELECT model_id FROM civitai_views ORDER BY viewed_at DESC LIMIT ?)`,
      )
      .run(limit);
  }

  views(limit = 200): CivitaiView[] {
    const rows = this.deps.dbs
      .get(this.active())
      .db.prepare(
        "SELECT model_id, name, type, creator, image, viewed_at FROM civitai_views ORDER BY viewed_at DESC LIMIT ?",
      )
      .all(limit) as Array<{
      model_id: number;
      name: string;
      type: string;
      creator: string | null;
      image: string | null;
      viewed_at: number;
    }>;
    return rows.map((r) => ({
      modelId: r.model_id,
      name: r.name,
      type: r.type,
      creator: r.creator,
      image: r.image ? (CivitaiImage.safeParse(JSON.parse(r.image)).data ?? null) : null,
      viewedAt: r.viewed_at,
    }));
  }

  clearViews(): void {
    this.deps.dbs.get(this.active()).db.exec("DELETE FROM civitai_views");
  }

  /** Take one opened model out of the history. */
  forgetView(modelId: number): void {
    this.deps.dbs
      .get(this.active())
      .db.prepare("DELETE FROM civitai_views WHERE model_id = ?")
      .run(modelId);
  }

  searches(): CivitaiSearch[] {
    const rows = this.deps.dbs
      .get(this.active())
      .db.prepare("SELECT query, at FROM civitai_searches ORDER BY at DESC LIMIT 100")
      .all() as Array<{ query: string; at: number }>;
    return rows.map((r) => ({ query: r.query, at: r.at }));
  }

  /**
   * The base models Civitai's filter offers now (ActiveBaseModel, else every BaseModel), a day
   * old at most; Blombo's built-in list when Civitai can't answer.
   */
  async baseModels(): Promise<CivitaiBaseModels> {
    try {
      const enums = await this.api.enums();
      const list = Array.isArray(enums.ActiveBaseModel) ? enums.ActiveBaseModel : enums.BaseModel;
      const names = Array.isArray(list)
        ? list.filter(
            (n): n is string => typeof n === "string" && n.trim() !== "" && n.length <= 60,
          )
        : [];
      if (names.length) return { names, fromCivitai: true };
    } catch {
      // Offline or a changed answer: the built-in list below.
    }
    return { names: [...KNOWN_BASE_MODELS], fromCivitai: false };
  }

  forgetSearch(query: string | null): void {
    const { db } = this.deps.dbs.get(this.active());
    if (query === null) db.exec("DELETE FROM civitai_searches");
    else db.prepare("DELETE FROM civitai_searches WHERE query = ?").run(query);
  }
}
