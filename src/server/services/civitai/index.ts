/**
 * The Civitai service: the profile's account (API key in secrets.json, checked with Civitai),
 * browsing through the cached API client, model pages with "installed" marks from the models
 * folder, and the browse and search history in the profile's database.
 */
import {
  type BrowseFilter,
  type CivitaiAccount,
  CivitaiImage,
  type CivitaiModel,
  type CivitaiPage,
  type CivitaiSearch,
  type CivitaiView,
  type LocalMark,
} from "../../../shared/civitai.ts";
import type { LocalModel } from "../../../shared/models.ts";
import type { ProfileDbs } from "../../db/profileDb.ts";
import { HttpError } from "../../lib/http.ts";
import type { ModelService } from "../models.ts";
import type { ProfileService } from "../profiles.ts";
import type { SettingsService } from "../settings.ts";
import { CivitaiApi, type RawModel, type RawVersion } from "./api.ts";
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

  async search(filter: BrowseFilter, cursor: string | null): Promise<CivitaiPage> {
    const profileId = this.active();
    const key = await this.key(profileId);
    const page = await this.api.models(filter, cursor, key);
    const ctx = await this.context();
    if (filter.query && !cursor) await this.recordSearch(profileId, filter.query);
    return {
      items: (page.items ?? [])
        .filter((m) => typeof m?.id === "number")
        .map((m) => normalize.card(m, ctx, !filter.nsfw)),
      nextCursor: (page.items?.length ?? 0) > 0 ? CivitaiApi.nextCursor(page) : null,
    };
  }

  async rawModel(id: number): Promise<RawModel> {
    return this.api.model(id, await this.key(this.active()));
  }

  async rawVersion(id: number): Promise<RawVersion> {
    return this.api.version(id, await this.key(this.active()));
  }

  /** A model page; opening one adds it to the browse history. */
  async model(id: number): Promise<CivitaiModel> {
    const profileId = this.active();
    const raw = await this.rawModel(id);
    const out = normalize.model(raw, await this.context());
    this.recordView(profileId, out);
    return out;
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

  searches(): CivitaiSearch[] {
    const rows = this.deps.dbs
      .get(this.active())
      .db.prepare("SELECT query, at FROM civitai_searches ORDER BY at DESC LIMIT 100")
      .all() as Array<{ query: string; at: number }>;
    return rows.map((r) => ({ query: r.query, at: r.at }));
  }

  forgetSearch(query: string | null): void {
    const { db } = this.deps.dbs.get(this.active());
    if (query === null) db.exec("DELETE FROM civitai_searches");
    else db.prepare("DELETE FROM civitai_searches WHERE query = ?").run(query);
  }
}
