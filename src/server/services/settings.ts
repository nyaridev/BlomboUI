/**
 * Settings service: data/profiles/<id>/settings.json (ADR-0006). One file per profile, read
 * through the shared schema (missing fields get defaults, older versions migrate) and written
 * atomically. A file that can't be parsed is left alone and defaults are used until the next
 * save, so a hand-edit mistake never loses the rest of the profile.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  mergeSettings,
  migrateSettings,
  type Settings,
  type SettingsPatch,
} from "../../shared/settings.ts";
import { Emitter } from "../lib/emitter.ts";
import { writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";

type SettingsEvents = {
  updated: (profileId: string, settings: Settings, previous: Settings) => void;
};

export class SettingsService extends Emitter<SettingsEvents> {
  private readonly dirOf: (profileId: string) => string;
  private readonly cache = new Map<string, Settings>();

  constructor(dirOf: (profileId: string) => string) {
    super();
    this.dirOf = dirOf;
  }

  file(profileId: string): string {
    return path.join(this.dirOf(profileId), "settings.json");
  }

  async get(profileId: string): Promise<Settings> {
    const cached = this.cache.get(profileId);
    if (cached) return cached;
    let raw: unknown = {};
    try {
      raw = JSON.parse(await fs.readFile(this.file(profileId), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn(`settings.json of "${profileId}" couldn't be read; using defaults.`, error);
    }
    let settings: Settings;
    try {
      settings = migrateSettings(raw);
    } catch (error) {
      console.warn(`settings.json of "${profileId}" has invalid values; using defaults.`, error);
      settings = migrateSettings({});
    }
    this.cache.set(profileId, settings);
    return settings;
  }

  async update(profileId: string, patch: SettingsPatch): Promise<Settings> {
    const previous = await this.get(profileId);
    let next: Settings;
    try {
      next = mergeSettings(previous, patch);
    } catch (error) {
      const issue = (error as { issues?: Array<{ path: unknown[]; message: string }> }).issues?.[0];
      throw new HttpError(
        400,
        issue ? `${issue.path.join(".")}: ${issue.message}` : "Those settings aren't valid.",
        "invalid_settings",
      );
    }
    await writeJsonAtomic(this.file(profileId), next);
    this.cache.set(profileId, next);
    this.emit("updated", profileId, next, previous);
    return next;
  }

  forget(profileId: string): void {
    this.cache.delete(profileId);
  }
}
