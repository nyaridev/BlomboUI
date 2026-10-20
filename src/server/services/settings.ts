/**
 * Settings service: data/profiles/<id>/settings.json (ADR-0006). One file per profile, read
 * through the shared schema (missing fields get defaults, older versions migrate) and written
 * atomically.
 *
 *  - A hand-edit mistake never loses the rest of the file: an invalid value falls back to its
 *    own default (`readSettings`), and the original file is kept next to it as
 *    `settings.invalid-<time>.json` before the first save replaces it.
 *  - A file written by a newer BlomboUI is read but never written over (this version would drop
 *    what it doesn't know); saving says to update BlomboUI.
 *  - Updates for one profile run one at a time, each merged onto the result of the one before,
 *    so two quick changes never undo each other.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  mergeSettings,
  readSettings,
  type Settings,
  type SettingsPatch,
} from "../../shared/settings.ts";
import { Emitter } from "../lib/emitter.ts";
import { writeFileAtomic, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";

type SettingsEvents = {
  updated: (profileId: string, settings: Settings, previous: Settings) => void;
};

interface Loaded {
  settings: Settings;
  /** The file as it was, when some of it had to be replaced by defaults (kept before saving). */
  damaged: string | null;
  newer: boolean;
}

export class SettingsService extends Emitter<SettingsEvents> {
  private readonly dirOf: (profileId: string) => string;
  private readonly cache = new Map<string, Loaded>();
  private readonly loading = new Map<string, Promise<Loaded>>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(dirOf: (profileId: string) => string) {
    super();
    this.dirOf = dirOf;
  }

  file(profileId: string): string {
    return path.join(this.dirOf(profileId), "settings.json");
  }

  async get(profileId: string): Promise<Settings> {
    return (await this.load(profileId)).settings;
  }

  private load(profileId: string): Promise<Loaded> {
    const cached = this.cache.get(profileId);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(profileId);
    if (!pending) {
      pending = this.read(profileId).finally(() => this.loading.delete(profileId));
      this.loading.set(profileId, pending);
    }
    return pending;
  }

  private async read(profileId: string): Promise<Loaded> {
    let text: string | null = null;
    let raw: unknown = {};
    let unreadable = false;
    try {
      text = await fs.readFile(this.file(profileId), "utf8");
      raw = JSON.parse(text);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        unreadable = text !== null;
        console.warn(`settings.json of "${profileId}" couldn't be read; using defaults.`, error);
      }
    }
    const { settings, dropped, newer } = readSettings(raw);
    if (dropped.length)
      console.warn(
        `settings.json of "${profileId}" has invalid values (${dropped.join(", ")}); using their defaults.`,
      );
    const loaded: Loaded = {
      settings,
      damaged: text !== null && (dropped.length > 0 || unreadable) ? text : null,
      newer,
    };
    if (!this.cache.has(profileId)) this.cache.set(profileId, loaded);
    return this.cache.get(profileId) as Loaded;
  }

  /** Merge a patch into the saved settings. */
  update(profileId: string, patch: SettingsPatch): Promise<Settings> {
    return this.updateWith(profileId, () => patch);
  }

  /**
   * Merge the patch `fn` builds from the current settings (for read-modify-write changes such
   * as adding a gallery library). Runs after any update already queued for the profile.
   */
  updateWith(profileId: string, fn: (current: Settings) => SettingsPatch): Promise<Settings> {
    const run = (this.queues.get(profileId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this.apply(profileId, fn));
    const tail = run.catch(() => undefined);
    this.queues.set(profileId, tail);
    void tail.then(() => {
      if (this.queues.get(profileId) === tail) this.queues.delete(profileId);
    });
    return run;
  }

  private async apply(profileId: string, fn: (current: Settings) => SettingsPatch) {
    const loaded = await this.load(profileId);
    if (loaded.newer)
      throw new HttpError(
        409,
        "These settings were saved by a newer BlomboUI. Update BlomboUI to change them.",
        "settings_newer",
      );
    const previous = loaded.settings;
    let next: Settings;
    try {
      next = mergeSettings(previous, fn(previous));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const issue = (error as { issues?: Array<{ path: unknown[]; message: string }> }).issues?.[0];
      throw new HttpError(
        400,
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Those settings aren't valid.",
        "invalid_settings",
      );
    }
    if (loaded.damaged !== null) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await writeFileAtomic(
        path.join(this.dirOf(profileId), `settings.invalid-${stamp}.json`),
        loaded.damaged,
      );
    }
    await writeJsonAtomic(this.file(profileId), next);
    this.cache.set(profileId, { settings: next, damaged: null, newer: false });
    this.emit("updated", profileId, next, previous);
    return next;
  }

  forget(profileId: string): void {
    this.cache.delete(profileId);
  }
}
