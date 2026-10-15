/**
 * Background matching of local models with Civitai. Models without a .civitai.info file are
 * hashed (SHA256, streamed, one at a time, smallest first) and looked up by hash; what Civitai
 * knows (name, image, base model, trigger words) fills Models → Local and the Generate pickers.
 *
 * Hashes and answers live in the profile's database (model_hashes, civitai_lookups), keyed by
 * path + size + mtime, so a file is hashed once until it changes; "not on Civitai" is asked
 * again after a week. Nothing is written next to the models. Progress goes out on the live bus
 * and the run stops on a profile switch, when the setting is off, or on request.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { LiveTopic, ServerMessage } from "../../shared/live.ts";
import {
  type LookupInfo,
  LookupInfo as LookupInfoSchema,
  type LookupState,
} from "../../shared/models.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import { HttpError } from "../lib/http.ts";
import type { CivitaiApi } from "./civitai/api.ts";
import { lookupInfo } from "./civitai/normalize.ts";
import type { ModelService } from "./models.ts";
import type { ProfileService } from "./profiles.ts";
import type { SettingsService } from "./settings.ts";

const MISSING_TTL = 7 * 24 * 3600_000;
const ERROR_TTL = 3600_000;
const PUBLISH_MS = 400;
const REFRESH_MS = 2500;

export interface LookupDeps {
  profiles: ProfileService;
  settings: SettingsService;
  dbs: ProfileDbs;
  models: ModelService;
  api: CivitaiApi;
  allowedImage: (url: string) => boolean;
  site: string;
  publish: (topic: LiveTopic | null, msg: ServerMessage) => void;
  /** New matches landed: the model list should be rescanned and windows told. */
  onFound: () => void;
}

const idle = (): LookupState => ({
  running: false,
  done: 0,
  total: 0,
  found: 0,
  current: null,
  error: null,
});

/** SHA256 of a file, streamed (uppercase hex, as Civitai writes it). */
export async function hashFile(file: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
  const stop = () => stream.destroy(new Error("cancelled"));
  signal?.addEventListener("abort", stop, { once: true });
  try {
    for await (const chunk of stream) hash.update(chunk as Buffer);
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  return hash.digest("hex").toUpperCase();
}

export class ModelLookup {
  private readonly deps: LookupDeps;
  private current: LookupState = idle();
  private run: { profileId: string; abort: AbortController; done: Promise<void> } | null = null;
  private again = false;
  private lastPublish = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: LookupDeps) {
    this.deps = deps;
  }

  state(): LookupState {
    return this.current;
  }

  /* ── stored hashes and answers (sync: the model scan reads them) ─────── */

  infoFor(profileId: string, id: string, size: number, mtime: number): LookupInfo | null {
    try {
      const row = this.deps.dbs
        .get(profileId)
        .db.prepare(
          `SELECT l.info FROM model_hashes h JOIN civitai_lookups l ON l.sha256 = h.sha256
           WHERE h.path = ? AND h.size = ? AND h.mtime = ? AND l.status = 'found'`,
        )
        .get(id, size, mtime) as { info: string | null } | undefined;
      if (!row?.info) return null;
      return LookupInfoSchema.safeParse(JSON.parse(row.info)).data ?? null;
    } catch {
      return null;
    }
  }

  recordHash(profileId: string, id: string, size: number, mtime: number, sha256: string): void {
    this.deps.dbs
      .get(profileId)
      .db.prepare(
        `INSERT INTO model_hashes (path, size, mtime, sha256, hashed_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime,
           sha256 = excluded.sha256, hashed_at = excluded.hashed_at`,
      )
      .run(id, size, mtime, sha256.toUpperCase(), Date.now());
  }

  recordLookup(
    profileId: string,
    sha256: string,
    status: "found" | "missing" | "error",
    info: LookupInfo | null,
  ): void {
    this.deps.dbs
      .get(profileId)
      .db.prepare(
        `INSERT INTO civitai_lookups (sha256, status, info, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (sha256) DO UPDATE SET status = excluded.status, info = excluded.info,
           fetched_at = excluded.fetched_at`,
      )
      .run(sha256.toUpperCase(), status, info ? JSON.stringify(info) : null, Date.now());
  }

  private storedHash(profileId: string, id: string, size: number, mtime: number): string | null {
    const row = this.deps.dbs
      .get(profileId)
      .db.prepare("SELECT sha256 FROM model_hashes WHERE path = ? AND size = ? AND mtime = ?")
      .get(id, size, mtime) as { sha256: string } | undefined;
    return row?.sha256 ?? null;
  }

  private storedLookup(
    profileId: string,
    sha256: string,
  ): { status: string; fetched_at: number } | null {
    return (
      (this.deps.dbs
        .get(profileId)
        .db.prepare("SELECT status, fetched_at FROM civitai_lookups WHERE sha256 = ?")
        .get(sha256) as { status: string; fetched_at: number } | undefined) ?? null
    );
  }

  /* ── the background run ─────────────────────────────────────────────── */

  /** Start (or restart after the current one) a run for the open profile. */
  start(): void {
    const profileId = this.deps.profiles.active;
    if (!profileId) return;
    if (this.run) {
      if (this.run.profileId === profileId) {
        this.again = true;
        return;
      }
      this.stop();
    }
    const abort = new AbortController();
    const done = this.runOnce(profileId, abort.signal)
      .catch((error) => {
        if (abort.signal.aborted) return;
        this.set({ error: error instanceof Error ? error.message : String(error) }, true);
      })
      .finally(() => {
        if (this.run?.abort === abort) this.run = null;
        this.set({ running: false, current: null }, true);
        this.flushFound();
        if (this.again && !abort.signal.aborted) {
          this.again = false;
          this.start();
        }
      });
    this.run = { profileId, abort, done };
  }

  stop(): void {
    this.again = false;
    this.run?.abort.abort();
    this.run = null;
  }

  /** Wait for the running lookup (tests). */
  async whenIdle(): Promise<void> {
    while (this.run) await this.run.done;
  }

  private set(patch: Partial<LookupState>, force = false): void {
    this.current = { ...this.current, ...patch };
    const now = Date.now();
    if (!force && now - this.lastPublish < PUBLISH_MS) return;
    this.lastPublish = now;
    this.deps.publish(null, { t: "models.lookup", lookup: this.current });
  }

  /** Matches are announced in batches, so a run that finds hundreds doesn't rescan hundreds. */
  private foundSoon(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => this.flushFound(), REFRESH_MS);
  }

  private flushFound(): void {
    if (!this.refreshTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.deps.onFound();
  }

  private async runOnce(profileId: string, signal: AbortSignal): Promise<void> {
    const settings = await this.deps.settings.get(profileId);
    if (!settings.civitai.lookup) return;
    const list = await this.deps.models.list();
    if (signal.aborted) return;
    const now = Date.now();
    // Only models without a Civitai info file, whose hash or answer is missing or out of date.
    const todo = list.models
      .filter((m) => !m.civitai || m.civitai.lookup)
      .filter((m) => {
        const sha = this.storedHash(profileId, m.id, m.size, m.mtime);
        if (!sha) return true;
        const known = this.storedLookup(profileId, sha);
        if (!known) return true;
        if (known.status === "found") return false;
        const ttl = known.status === "missing" ? MISSING_TTL : ERROR_TTL;
        return now - known.fetched_at > ttl;
      })
      .sort((a, b) => a.size - b.size);
    this.current = { ...idle(), running: todo.length > 0, total: todo.length };
    this.set({}, true);
    for (const m of todo) {
      if (signal.aborted || this.deps.profiles.active !== profileId) return;
      this.set({ current: m.file });
      let sha = this.storedHash(profileId, m.id, m.size, m.mtime);
      if (!sha) {
        let file: string;
        try {
          file = await this.deps.models.filePath(m.id);
          sha = await hashFile(file, signal);
        } catch {
          if (signal.aborted) return;
          this.set({ done: this.current.done + 1 });
          continue;
        }
        this.recordHash(profileId, m.id, m.size, m.mtime, sha);
      }
      const known = this.storedLookup(profileId, sha);
      if (known?.status !== "found") {
        try {
          const version = await this.deps.api.byHash(sha, signal);
          const info = version
            ? lookupInfo(version, { allowed: this.deps.allowedImage, site: this.deps.site })
            : null;
          this.recordLookup(profileId, sha, info ? "found" : "missing", info);
          if (info) {
            this.set({ found: this.current.found + 1 });
            this.foundSoon();
          }
        } catch (error) {
          if (signal.aborted) return;
          this.recordLookup(profileId, sha, "error", null);
          // Civitai is down or refusing: stop for now; the next run picks up where this one was.
          if (error instanceof HttpError && (error.status === 429 || error.status >= 500)) {
            this.set({ done: this.current.done + 1, error: error.message }, true);
            return;
          }
        }
      }
      this.set({ done: this.current.done + 1 });
    }
  }
}
