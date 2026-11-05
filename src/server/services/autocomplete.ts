/**
 * Prompt autocomplete: suggestions for the prompt editor from
 *
 *  - tag lists: bundled CSVs in presets/tags/ and the profile's own in data/profiles/<id>/tags/
 *    (shared/autocomplete.ts has the format; added by drop or downloaded from TAG_SOURCES),
 *    parsed once per file version and kept sorted by popularity, so a keystroke is a scan over a
 *    few hundred thousand short strings at most
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
  newestDated,
  normalizeTag,
  parseTagCsv,
  promptTags,
  type Suggestion,
  shortCount,
  TAG_SOURCES,
  type TagListInfo,
  type TagListsResponse,
  type TagRow,
  type TagSource,
  type TagSourceInfo,
  tagWordCount,
} from "../../shared/autocomplete.ts";
import { formatLoraTag } from "../../shared/prompt/loras.ts";
import type { AutocompleteSettings } from "../../shared/settings.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import { exists, movePath, writeFileIfAbsent } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { fetchFollow, readLimited } from "../lib/remote.ts";
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
  /** GitHub's API and raw-file hosts for TAG_SOURCES (tests point them at a fake). */
  github?: { api: string; raw: string };
  fetch?: typeof fetch;
}

const GITHUB = { api: "https://api.github.com/", raw: "https://raw.githubusercontent.com/" };
/** How long a folder listing is trusted; the archive changes monthly at most. */
const FOLDER_TTL = 60 * 60 * 1000;

function listName(file: string): string {
  const stem = file.replace(/\.csv$/i, "").replace(/[-_]+/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export class AutocompleteService {
  private readonly deps: AutocompleteDeps;
  private readonly cache = new Map<string, ParsedList>();
  private readonly errors = new Map<string, string>();
  private readonly folders = new Map<
    string,
    { at: number; items: Array<{ name: string; size: number }> }
  >();

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
    return {
      lists,
      folder: this.tagsDir(profileId),
      frequent: this.frequent(50, settings.frequentMaxWords),
    };
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

  /* ── downloadable lists (TAG_SOURCES) ─────────────────────────────────── */

  /** GET from GitHub (its API or raw files only), failing on anything but 200. */
  private async github(url: URL, timeoutMs: number): Promise<Response> {
    const gh = this.deps.github ?? GITHUB;
    const ok = [new URL(gh.api).origin, new URL(gh.raw).origin];
    const res = await fetchFollow(url.href, {
      allow: (u) => ok.includes(u.origin),
      headers: { accept: "application/vnd.github+json" },
      fetch: this.deps.fetch,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`GitHub answered ${res.status}`);
    }
    return res;
  }

  /** The files in a repository folder, from GitHub's contents API (kept for an hour). */
  private async folder(repo: string, dir: string): Promise<Array<{ name: string; size: number }>> {
    const key = `${repo}/${dir}`;
    const hit = this.folders.get(key);
    if (hit && Date.now() - hit.at < FOLDER_TTL) return hit.items;
    const gh = this.deps.github ?? GITHUB;
    const res = await this.github(new URL(`repos/${repo}/contents/${dir}`, gh.api), 20_000);
    const body = (await res.json()) as Array<{ name?: unknown; size?: unknown; type?: unknown }>;
    const items = (Array.isArray(body) ? body : [])
      .filter((x) => x.type === "file" && typeof x.name === "string")
      .map((x) => ({ name: x.name as string, size: typeof x.size === "number" ? x.size : 0 }));
    this.folders.set(key, { at: Date.now(), items });
    return items;
  }

  /** Where a source's file is right now: its URL, the date of its data and its size. */
  private async locate(
    s: TagSource,
  ): Promise<{ url: URL; date: string | null; bytes: number | null }> {
    const gh = this.deps.github ?? GITHUB;
    const { from } = s;
    if ("path" in from) {
      const dir = from.path.slice(0, from.path.lastIndexOf("/"));
      const name = from.path.slice(from.path.lastIndexOf("/") + 1);
      // The size is only for show: a failed lookup still leaves the fixed file downloadable.
      const items = await this.folder(from.repo, dir).catch(() => []);
      return {
        url: new URL(`${from.repo}/main/${from.path}`, gh.raw),
        date: from.date,
        bytes: items.find((i) => i.name === name)?.size ?? null,
      };
    }
    const items = await this.folder(from.repo, from.dir);
    const newest = newestDated(
      items.map((i) => i.name),
      from.prefix,
    );
    if (!newest) throw new Error("no list found in the archive");
    return {
      url: new URL(`${from.repo}/main/${from.dir}/${newest.name}`, gh.raw),
      date: newest.date,
      bytes: items.find((i) => i.name === newest.name)?.size ?? null,
    };
  }

  /** Every source with the file it would download now; date null when GitHub didn't answer. */
  async sources(): Promise<TagSourceInfo[]> {
    return Promise.all(
      TAG_SOURCES.map(async (s) => {
        const info = { id: s.id, name: s.name, hint: s.hint, file: s.file, repo: s.from.repo };
        try {
          const { date, bytes } = await this.locate(s);
          return { ...info, date, bytes };
        } catch {
          return { ...info, date: null, bytes: null };
        }
      }),
    );
  }

  /**
   * Download one of TAG_SOURCES into the profile's tags folder, with a comment line on top that
   * says where it's from and how old it is (the parser skips # lines).
   */
  async downloadList(id: string): Promise<TagListInfo> {
    const source = TAG_SOURCES.find((s) => s.id === id);
    if (!source) throw new HttpError(400, "Unknown tag list.", "bad_source");
    if (await exists(path.join(this.tagsDir(), source.file)))
      throw new HttpError(409, `${source.name} is already in your lists.`, "exists");
    let bytes: Uint8Array;
    try {
      const at = await this.locate(source);
      const body = await readLimited(await this.github(at.url, 120_000), MAX_LIST_BYTES);
      const note = new TextEncoder().encode(
        `# ${source.name} tags${at.date ? ` as of ${at.date}` : ""}, from github.com/${source.from.repo}\n`,
      );
      bytes = new Uint8Array(note.byteLength + body.byteLength);
      bytes.set(note);
      bytes.set(body, note.byteLength);
    } catch (e) {
      throw new HttpError(
        502,
        `Couldn't download ${source.name} (${(e as Error).message}). Check your connection and try again.`,
        "download",
      );
    }
    return this.addList(source.file, bytes);
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

  /** Count the tags of the prompts a click sent (parts longer than `frequentMaxWords` aren't). */
  async record(texts: string[]): Promise<void> {
    const profileId = this.deps.profiles.active;
    if (!profileId) return;
    try {
      const max = (await this.deps.settings.get(profileId)).autocomplete.frequentMaxWords;
      const tags = [...new Set(texts.flatMap(promptTags))].filter((t) => tagWordCount(t) <= max);
      if (!tags.length) return;
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

  /**
   * The most used tags of at most `maxWords` words. Tags are stored with underscores, so a tag
   * has one word more than underscores; ones counted before the limit was lowered stay hidden.
   */
  frequent(
    limit: number,
    maxWords: number,
    prefix = "",
    since = 0,
  ): Array<{ tag: string; uses: number }> {
    const profileId = this.deps.profiles.active;
    if (!profileId) return [];
    const like = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.deps.dbs
      .get(profileId)
      .db.prepare(
        "SELECT tag, uses FROM tag_usage WHERE uses >= ? AND tag LIKE ? ESCAPE '\\' AND LENGTH(tag) - LENGTH(REPLACE(tag, '_', '')) < ? AND last_used >= ? ORDER BY uses DESC, last_used DESC LIMIT ?",
      )
      .all(FREQUENT_MIN_USES, like, maxWords, since, limit) as Array<{
      tag: string;
      uses: number;
    }>;
  }

  /** The most used tags (the gallery's Home), ever or among the ones used since `since`. */
  async usedTags(limit: number, since = 0): Promise<Array<{ tag: string; uses: number }>> {
    const max = (await this.deps.settings.get(this.profileId())).autocomplete.frequentMaxWords;
    return this.frequent(limit, max, "", since);
  }

  clearFrequent(): void {
    this.deps.dbs.get(this.profileId()).db.exec("DELETE FROM tag_usage");
  }

  /* ── suggestions ──────────────────────────────────────────────────────── */

  async suggest(q: string, mode: CompleteMode, limit: number): Promise<Suggestion[]> {
    const profileId = this.profileId();
    const settings = (await this.deps.settings.get(profileId)).autocomplete;
    if (!settings.enabled) return [];
    if (mode === "lora") return settings.sources.loras ? this.loras(q, limit) : [];
    if (mode === "wildcard") return settings.sources.wildcards ? this.wildcards(q, limit) : [];
    return this.tags(q, limit, settings);
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
      for (const f of this.frequent(Math.min(5, limit), s.frequentMaxWords, want)) {
        uses.set(f.tag, f.uses);
        push({
          kind: "tag",
          text: f.tag,
          label: f.tag,
          detail: `used ${f.uses}×`,
          category: null,
          thumb: null,
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
        text: formatLoraTag(name, m.weight ?? 1),
        label: m.name,
        detail: m.baseModel ?? (m.folder || null),
        category: null,
        thumb: m.thumb,
        uses: null,
        triggers: m.triggerWords,
      };
    });
  }

  private async wildcards(q: string, limit: number): Promise<Suggestion[]> {
    const profile = await this.deps.profiles.get(this.profileId());
    const names = await listWildcards(profile.folders.wildcards.map((f) => f.path)).catch(() => []);
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
        uses: null,
      }));
  }
}
