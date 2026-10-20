/**
 * Prompt autocomplete: suggestions for the prompt editor from
 *
 *  - tag lists: bundled CSVs in presets/tags/ and the profile's own in data/profiles/<id>/tags/
 *    (shared/autocomplete.ts has the format), parsed once per file version and kept sorted by
 *    popularity, so a keystroke is a scan over a few hundred thousand short strings at most
 *  - LoRAs and their trigger words, from Models → Local (Civitai info files and lookups)
 *  - wildcards, from the profile's wildcards folder
 *  - frequent tags: every Generate click counts the prompt's tags in the profile database
 *
 * Search runs on the server so the page never holds the big lists.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  type CompleteMode,
  normalizeTag,
  parseTagCsv,
  promptTags,
  type Suggestion,
  shortCount,
  type TagListInfo,
  type TagListsResponse,
  type TagRow,
} from "../../shared/autocomplete.ts";
import type { AutocompleteSettings } from "../../shared/settings.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import { exists, movePath, writeFileIfAbsent } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ModelService } from "./models.ts";
import type { ProfileService } from "./profiles.ts";
import type { SettingsService } from "./settings.ts";
import { listWildcards } from "./wildcards.ts";

const MAX_LIST_BYTES = 64 * 1024 * 1024;
const FREQUENT_MIN_USES = 2;

interface ParsedList {
  key: string;
  rows: TagRow[];
  /** Lowercase names and aliases, aligned with rows, for fast matching. */
  names: string[];
  aliases: string[][];
}

interface ListFile {
  id: string;
  source: "bundled" | "profile";
  file: string;
  abs: string;
}

export interface AutocompleteDeps {
  presetsDir: string;
  profiles: ProfileService;
  settings: SettingsService;
  dbs: ProfileDbs;
  models: ModelService;
}

function listName(file: string): string {
  const stem = file.replace(/\.csv$/i, "").replace(/[-_]+/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export class AutocompleteService {
  private readonly deps: AutocompleteDeps;
  private readonly cache = new Map<string, ParsedList>();
  private readonly errors = new Map<string, string>();

  constructor(deps: AutocompleteDeps) {
    this.deps = deps;
  }

  private profileId(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  tagsDir(profileId = this.profileId()): string {
    return path.join(this.deps.profiles.dir(profileId), "tags");
  }

  private async files(): Promise<ListFile[]> {
    const out: ListFile[] = [];
    const scan = async (dir: string, source: ListFile["source"]) => {
      let names: string[] = [];
      try {
        names = (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith(".csv")).sort();
      } catch {
        return;
      }
      for (const file of names)
        out.push({ id: `${source}:${file}`, source, file, abs: path.join(dir, file) });
    };
    await scan(path.join(this.deps.presetsDir, "tags"), "bundled");
    await scan(this.tagsDir(), "profile");
    return out;
  }

  /** A list, parsed once per size + mtime. */
  private async parsed(f: ListFile): Promise<ParsedList | null> {
    try {
      const st = await fs.stat(f.abs);
      const key = `${st.size}:${st.mtimeMs}`;
      const hit = this.cache.get(f.abs);
      if (hit?.key === key) return hit;
      if (st.size > MAX_LIST_BYTES) throw new Error("It's larger than 64 MB.");
      const rows = parseTagCsv(await fs.readFile(f.abs, "utf8"));
      // Most used first; equal counts keep the file's order (sort is stable).
      rows.sort((a, b) => b.count - a.count);
      const list: ParsedList = {
        key,
        rows,
        names: rows.map((r) => r.name.toLowerCase()),
        aliases: rows.map((r) => r.aliases.map((a) => a.toLowerCase())),
      };
      this.cache.set(f.abs, list);
      this.errors.delete(f.abs);
      return list;
    } catch (error) {
      this.errors.set(f.abs, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /* ── lists (Settings → Autocomplete) ──────────────────────────────────── */

  async lists(): Promise<TagListsResponse> {
    const profileId = this.profileId();
    const settings = (await this.deps.settings.get(profileId)).autocomplete;
    const lists: TagListInfo[] = [];
    for (const f of await this.files()) {
      const parsed = await this.parsed(f);
      lists.push({
        id: f.id,
        name: listName(f.file),
        source: f.source,
        file: f.file,
        tags: parsed?.rows.length ?? 0,
        enabled: !settings.disabledLists.includes(f.id),
        error: parsed ? null : (this.errors.get(f.abs) ?? "It couldn't be read."),
      });
    }
    return { lists, folder: this.tagsDir(profileId), frequent: this.frequent(50) };
  }

  async addList(file: string, bytes: Uint8Array): Promise<TagListInfo> {
    if (bytes.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    if (bytes.byteLength > MAX_LIST_BYTES)
      throw new HttpError(413, "That list is too large (64 MB max).", "too_large");
    const rows = parseTagCsv(new TextDecoder().decode(bytes));
    if (!rows.length)
      throw new HttpError(
        400,
        "No tags found. Use one tag per line: name,category,count,aliases.",
        "no_tags",
      );
    const abs = path.join(this.tagsDir(), file);
    if (!(await writeFileIfAbsent(abs, bytes)))
      throw new HttpError(
        409,
        `There's already a list named ${file}. Rename the file first.`,
        "exists",
      );
    return {
      id: `profile:${file}`,
      name: listName(file),
      source: "profile",
      file,
      tags: rows.length,
      enabled: true,
      error: null,
    };
  }

  /** Move a profile list to data/profiles/<id>/trash/tags/. */
  async removeList(file: string): Promise<void> {
    const profileId = this.profileId();
    const abs = path.join(this.tagsDir(profileId), file);
    if (!(await exists(abs))) throw new HttpError(404, "That list was not found.", "no_list");
    const trash = path.join(
      this.deps.profiles.dir(profileId),
      "trash",
      "tags",
      `${Date.now()}-${file}`,
    );
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await movePath(abs, trash);
    this.cache.delete(abs);
  }

  /* ── frequent tags ────────────────────────────────────────────────────── */

  /** Count the tags of the prompts a click sent. */
  record(texts: string[]): void {
    const profileId = this.deps.profiles.active;
    if (!profileId) return;
    const tags = [...new Set(texts.flatMap(promptTags))];
    if (!tags.length) return;
    try {
      const db = this.deps.dbs.get(profileId).db;
      const now = Date.now();
      const upsert = db.prepare(
        "INSERT INTO tag_usage (tag, uses, last_used) VALUES (?, 1, ?) ON CONFLICT (tag) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used",
      );
      db.exec("BEGIN");
      try {
        for (const t of tags) upsert.run(t, now);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.warn("Couldn't count prompt tags:", error);
    }
  }

  frequent(limit: number, prefix = ""): Array<{ tag: string; uses: number }> {
    const profileId = this.deps.profiles.active;
    if (!profileId) return [];
    const like = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.deps.dbs
      .get(profileId)
      .db.prepare(
        "SELECT tag, uses FROM tag_usage WHERE uses >= ? AND tag LIKE ? ESCAPE '\\' ORDER BY uses DESC, last_used DESC LIMIT ?",
      )
      .all(FREQUENT_MIN_USES, like, limit) as Array<{ tag: string; uses: number }>;
  }

  clearFrequent(): void {
    this.deps.dbs.get(this.profileId()).db.exec("DELETE FROM tag_usage");
  }

  /* ── suggestions ──────────────────────────────────────────────────────── */

  async suggest(q: string, mode: CompleteMode, limit: number): Promise<Suggestion[]> {
    const profileId = this.profileId();
    const settings = (await this.deps.settings.get(profileId)).autocomplete;
    if (!settings.enabled) return [];
    const max = Math.min(limit, settings.maxResults);
    if (mode === "lora") return settings.sources.loras ? this.loras(q, max) : [];
    if (mode === "wildcard") return settings.sources.wildcards ? this.wildcards(q, max) : [];
    return this.tags(q, max, settings);
  }

  private async tags(q: string, limit: number, s: AutocompleteSettings): Promise<Suggestion[]> {
    const want = normalizeTag(q);
    if (want.length < 1) return [];
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    const push = (sug: Suggestion) => {
      const key = normalizeTag(sug.text);
      if (seen.has(key) || out.length >= limit) return;
      seen.add(key);
      out.push(sug);
    };

    const uses = new Map<string, number>();
    if (s.sources.frequent)
      for (const f of this.frequent(Math.min(5, limit), want)) {
        uses.set(f.tag, f.uses);
        push({
          kind: "tag",
          text: f.tag,
          label: f.tag,
          detail: `used ${f.uses}×`,
          category: null,
          thumb: null,
          nsfw: false,
          uses: f.uses,
        });
      }

    if (s.sources.tags) {
      const lists: ParsedList[] = [];
      for (const f of await this.files())
        if (!s.disabledLists.includes(f.id)) {
          const p = await this.parsed(f);
          if (p) lists.push(p);
        }
      // The exact tag first, then prefixes by popularity, then matches anywhere.
      for (const list of lists) {
        const exact = list.names.indexOf(want);
        if (exact >= 0) push(this.tagSuggestion(list.rows[exact] as TagRow, null, uses));
      }
      const contains: Array<{ row: TagRow; alias: string | null }> = [];
      for (const list of lists) {
        for (let i = 0; i < list.rows.length && out.length < limit; i++) {
          const name = list.names[i] as string;
          const row = list.rows[i] as TagRow;
          const alias = name.startsWith(want)
            ? null
            : ((list.aliases[i] as string[]).find((a) => a.startsWith(want)) ?? undefined);
          if (alias === undefined) {
            if (contains.length < limit && name.includes(want)) contains.push({ row, alias: null });
            continue;
          }
          push(this.tagSuggestion(row, alias, uses));
        }
      }
      for (const c of contains) push(this.tagSuggestion(c.row, c.alias, uses));
    }

    if (s.sources.triggers && out.length < limit) {
      const lower = q.trim().toLowerCase();
      for (const m of await this.loraModels()) {
        for (const word of m.triggerWords) {
          if (!word.toLowerCase().includes(lower)) continue;
          push({
            kind: "trigger",
            text: word,
            label: word,
            detail: `trigger · ${m.name}`,
            category: null,
            thumb: m.thumb,
            nsfw: m.nsfw,
            uses: null,
          });
        }
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  private tagSuggestion(row: TagRow, alias: string | null, uses: Map<string, number>): Suggestion {
    const used = uses.get(normalizeTag(row.name)) ?? null;
    return {
      kind: "tag",
      text: row.name,
      label: row.name,
      detail: alias ? `${alias} →` : row.count > 0 ? shortCount(row.count) : null,
      category: row.category,
      thumb: null,
      nsfw: false,
      uses: used,
    };
  }

  private async loraModels() {
    const list = await this.deps.models.list().catch(() => null);
    return (list?.models ?? []).filter((m) => m.kind === "loras");
  }

  private async loras(q: string, limit: number): Promise<Suggestion[]> {
    const models = await this.loraModels();
    const stems = models.map((m) => m.file.replace(/\.[^.]+$/, ""));
    const lower = q.trim().toLowerCase();
    const scored = models
      .map((m, i) => {
        const stem = stems[i] as string;
        const hay = `${stem} ${m.name} ${m.folder}`.toLowerCase();
        const at = lower ? hay.indexOf(lower) : 0;
        return { m, stem, at };
      })
      .filter((x) => x.at >= 0)
      .sort((a, b) => Number(a.at !== 0) - Number(b.at !== 0) || a.stem.localeCompare(b.stem))
      .slice(0, limit);
    return scored.map(({ m, stem }) => {
      // The file name finds it; two files with the same name need their folder.
      const dup = stems.filter((s) => s.toLowerCase() === stem.toLowerCase()).length > 1;
      const name = dup && m.folder ? `${m.folder}/${stem}` : stem;
      return {
        kind: "lora",
        text: `<lora:${name}:1>`,
        label: m.name,
        detail: m.baseModel ?? (m.folder || null),
        category: null,
        thumb: m.thumb,
        nsfw: m.nsfw,
        uses: null,
        triggers: m.triggerWords,
      };
    });
  }

  private async wildcards(q: string, limit: number): Promise<Suggestion[]> {
    const profile = await this.deps.profiles.get(this.profileId());
    const names = await listWildcards(profile.paths.wildcards).catch(() => []);
    const lower = q.toLowerCase();
    return names
      .filter((n) => n.toLowerCase().includes(lower))
      .sort(
        (a, b) =>
          Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)),
      )
      .slice(0, limit)
      .map((n) => ({
        kind: "wildcard" as const,
        text: `__${n}__`,
        label: n,
        detail: "wildcard",
        category: null,
        thumb: null,
        nsfw: false,
        uses: null,
      }));
  }
}
