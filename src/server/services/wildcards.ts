/**
 * Wildcard files in a profile's wildcards folder.
 *
 *   __outfits/fantasy__  → <wildcards>/outfits/fantasy.txt, one option per line
 *                        → or the key path outfits/fantasy in any .yaml / .yml file
 *
 * The compiler gets a plain synchronous lookup (`loadWildcards`), read before each run. The
 * Wildcard Manager reads, saves (atomically, refusing to overwrite a newer file), creates,
 * renames and trashes files here. Deleting moves into the profile's trash; reading never
 * changes anything.
 */
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  expandPrompt,
  findWildcards,
  type WildcardResolver,
  wildcardLines,
} from "../../shared/prompt/wildcards.ts";
import { rng } from "../../shared/random.ts";
import {
  flattenYamlWildcards,
  type RollResult,
  txtWildcardName,
  type WildcardEntry,
  type WildcardEntryType,
  type WildcardFile,
  type WildcardTree,
  wildcardFormat,
} from "../../shared/wildcards.ts";
import { exists, movePath, resolveInside, writeFileAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";

const MAX_FILES = 20_000;

function fileFor(root: string, name: string): string | null {
  const rel = `${name.replace(/\\/g, "/")}.txt`;
  const target = path.resolve(root, rel);
  const inside = path.relative(root, target);
  return inside.startsWith("..") || path.isAbsolute(inside) ? null : target;
}

const toRel = (p: string) => p.split(path.sep).join("/");

/* ── YAML index (cached per file by mtime) ─────────────────────────────── */

const yamlCache = new Map<string, { mtime: number; names: Map<string, string[]> }>();

async function walkFiles(root: string, onFile: (abs: string, e: Dirent) => void): Promise<void> {
  let count = 0;
  const walk = async (dir: string, depth: number) => {
    if (depth > 16) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count >= MAX_FILES || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile() && wildcardFormat(e.name)) {
        count++;
        onFile(full, e);
      }
    }
  };
  await walk(root, 0);
}

/** Every YAML-defined wildcard name under `root`. First file (by path) wins on duplicates. */
export async function yamlWildcards(root: string): Promise<Map<string, string[]>> {
  const files: string[] = [];
  await walkFiles(root, (abs) => {
    if (wildcardFormat(abs) === "yaml") files.push(abs);
  });
  files.sort((a, b) => a.localeCompare(b));
  const out = new Map<string, string[]>();
  for (const file of files) {
    let mtime = 0;
    try {
      mtime = (await fs.stat(file)).mtimeMs;
    } catch {
      continue;
    }
    let cached = yamlCache.get(file);
    if (!cached || cached.mtime !== mtime) {
      let names = new Map<string, string[]>();
      try {
        names = flattenYamlWildcards(parseYaml(await fs.readFile(file, "utf8")));
      } catch {
        // Invalid YAML defines nothing; the editor's lint says why.
      }
      cached = { mtime, names };
      yamlCache.set(file, cached);
    }
    for (const [k, v] of cached.names) if (!out.has(k)) out.set(k, v);
  }
  return out;
}

/** Load every wildcard the texts use (and the ones those use) into a resolver. */
export async function loadWildcards(
  root: string,
  texts: string[],
  overrides: Record<string, string[]> = {},
): Promise<WildcardResolver> {
  const found = new Map<string, string[]>(Object.entries(overrides));
  if (!root.trim()) return (name) => found.get(name);
  let yaml: Map<string, string[]> | null = null;
  const used = [...texts, ...Object.values(overrides).flat()].flatMap(findWildcards);
  let pending = [...new Set(used)];
  for (let depth = 0; pending.length && depth < 10; depth++) {
    const next: string[] = [];
    for (const name of pending) {
      if (found.has(name)) continue;
      const file = fileFor(root, name);
      let lines: string[] | null = null;
      if (file) {
        try {
          lines = wildcardLines(await fs.readFile(file, "utf8"));
        } catch {
          lines = null;
        }
      }
      if (lines === null) {
        yaml ??= await yamlWildcards(root);
        lines = yaml.get(name) ?? [];
      }
      found.set(name, lines);
      for (const line of lines)
        for (const inner of findWildcards(line)) if (!found.has(inner)) next.push(inner);
    }
    pending = next;
  }
  return (name) => {
    const lines = found.get(name);
    return lines?.length ? lines : undefined;
  };
}

/** Wildcard names under the folder ("outfits/fantasy"), from .txt files and YAML keys. */
export async function listWildcards(root: string): Promise<string[]> {
  if (!root.trim()) return [];
  const out = new Set<string>();
  await walkFiles(root, (abs) => {
    if (wildcardFormat(abs) === "txt") out.add(txtWildcardName(toRel(path.relative(root, abs))));
  });
  for (const name of (await yamlWildcards(root)).keys()) out.add(name);
  return [...out].sort((a, b) => a.localeCompare(b));
}

/* ── the manager ───────────────────────────────────────────────────────── */

export class WildcardFiles {
  readonly root: string;
  private readonly trashDir: string;

  constructor(root: string, trashDir: string) {
    this.root = root.trim();
    this.trashDir = trashDir;
  }

  private abs(rel: string): string {
    if (!this.root)
      throw new HttpError(409, "Set a wildcards folder in Settings → Folders.", "no_root");
    return resolveInside(this.root, rel);
  }

  private needsFormat(rel: string): void {
    if (!wildcardFormat(rel))
      throw new HttpError(400, "Wildcard files end in .txt, .yaml or .yml.", "bad_extension");
  }

  async tree(): Promise<WildcardTree> {
    const exists_ = Boolean(this.root) && (await isDir(this.root));
    const entries: WildcardEntry[] = [];
    if (exists_) {
      const walk = async (dir: string, depth: number) => {
        if (depth > 16 || entries.length >= MAX_FILES) return;
        let items: Dirent[];
        try {
          items = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of items) {
          if (e.name.startsWith(".")) continue;
          const full = path.join(dir, e.name);
          const rel = toRel(path.relative(this.root, full));
          if (e.isDirectory()) {
            entries.push({ path: rel, type: "folder", format: null, size: 0, mtime: 0 });
            await walk(full, depth + 1);
          } else if (e.isFile() && wildcardFormat(e.name)) {
            const stat = await fs.stat(full).catch(() => null);
            entries.push({
              path: rel,
              type: "file",
              format: wildcardFormat(e.name),
              size: stat?.size ?? 0,
              mtime: stat?.mtimeMs ?? 0,
            });
          }
        }
      };
      await walk(this.root, 0);
    }
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return {
      root: this.root,
      exists: exists_,
      entries,
      names: exists_ ? await listWildcards(this.root) : [],
    };
  }

  async read(rel: string): Promise<WildcardFile> {
    this.needsFormat(rel);
    const file = this.abs(rel);
    try {
      const [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
      return {
        path: rel,
        format: wildcardFormat(rel) ?? "txt",
        text: text.replace(/^﻿/, ""),
        mtime: stat.mtimeMs,
      };
    } catch {
      throw new HttpError(404, `"${rel}" isn't in the wildcards folder anymore.`, "not_found");
    }
  }

  async save(rel: string, text: string, baseMtime: number | null): Promise<WildcardFile> {
    this.needsFormat(rel);
    const file = this.abs(rel);
    const stat = await fs.stat(file).catch(() => null);
    if (stat && baseMtime !== null && Math.abs(stat.mtimeMs - baseMtime) > 1)
      throw new HttpError(
        409,
        `"${rel}" changed on disk since you opened it. Reload it, or copy your text and save again.`,
        "conflict",
      );
    await writeFileAtomic(file, text);
    const after = await fs.stat(file);
    return { path: rel, format: wildcardFormat(rel) ?? "txt", text, mtime: after.mtimeMs };
  }

  async create(rel: string, type: WildcardEntryType): Promise<void> {
    const target = this.abs(rel);
    if (await exists(target)) throw new HttpError(409, `"${rel}" already exists.`, "exists");
    if (type === "folder") {
      await fs.mkdir(target, { recursive: true });
      return;
    }
    this.needsFormat(rel);
    await writeFileAtomic(target, "");
  }

  async move(from: string, to: string): Promise<void> {
    const src = this.abs(from);
    const dest = this.abs(to);
    const stat = await fs.stat(src).catch(() => null);
    if (!stat)
      throw new HttpError(404, `"${from}" isn't in the wildcards folder anymore.`, "not_found");
    if (stat.isFile()) this.needsFormat(to);
    if (
      stat.isDirectory() &&
      path.relative(src, dest) &&
      !path.relative(src, dest).startsWith("..")
    )
      throw new HttpError(400, "A folder can't move into itself.", "into_itself");
    await movePath(src, dest);
  }

  /** Move a file or folder into the profile's trash. Returns where it went. */
  async remove(rel: string): Promise<string> {
    const src = this.abs(rel);
    if (!(await exists(src)))
      throw new HttpError(404, `"${rel}" isn't in the wildcards folder anymore.`, "not_found");
    const dest = path.join(
      this.trashDir,
      `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
      ...rel.split("/"),
    );
    await movePath(src, dest);
    return dest;
  }

  async roll(
    text: string,
    count: number,
    seed: number | undefined,
    overrides: Record<string, string[]>,
  ): Promise<RollResult> {
    const resolve = await loadWildcards(this.root, [text], overrides);
    const base = seed ?? Math.floor(Math.random() * 2 ** 32);
    return {
      rolls: Array.from({ length: count }, (_, i) => {
        const s = (base + i) >>> 0;
        const r = expandPrompt(text, rng(s), resolve);
        return { seed: s, text: r.text, used: r.used, missing: r.missing };
      }),
    };
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
