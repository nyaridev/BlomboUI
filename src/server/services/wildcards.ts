/**
 * Wildcard files in a profile's wildcard folders. A profile can have several (ADR-0017); a name
 * is looked up in each in order and the higher folder wins, a .txt file before YAML keys.
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
import {
  isMap,
  isScalar,
  type Pair,
  parseDocument,
  parse as parseYaml,
  stringify as stringifyYaml,
} from "yaml";
import type { ProfileFolder } from "../../shared/profile.ts";
import { type RenameChange, renameRefs } from "../../shared/prompt/renames.ts";
import {
  findWildcards,
  type WildcardResolver,
  wildcardLines,
} from "../../shared/prompt/wildcards.ts";
import {
  flattenYamlWildcards,
  txtWildcardName,
  WILDCARD_SAMPLE,
  type WildcardEntry,
  type WildcardEntryType,
  type WildcardFile,
  type WildcardInfo,
  type WildcardStat,
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
const trimSlash = (p: string) => p.replace(/\/+$/, "");

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

/** The YAML files under `root`, in the order their names win (by path). */
async function yamlFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  await walkFiles(root, (abs) => {
    if (wildcardFormat(abs) === "yaml") files.push(abs);
  });
  return files.sort((a, b) => a.localeCompare(b));
}

/** The wildcard names one YAML file defines (cached by mtime); null when it's gone. */
async function yamlNames(file: string): Promise<Map<string, string[]> | null> {
  let mtime = 0;
  try {
    mtime = (await fs.stat(file)).mtimeMs;
  } catch {
    return null;
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
  return cached.names;
}

/**
 * Rename the key at `keys` ("outfits", "fantasy") in YAML text to `to`, changing only that key's
 * characters, so comments and formatting stay as they were. `group` says which kind is meant: a
 * group (keys inside) or a wildcard (anything else). null when the text has no such key; "exists"
 * when a key beside it already has the new name.
 */
export function renameYamlKey(
  text: string,
  keys: readonly string[],
  to: string,
  group: boolean,
): string | null | "exists" {
  const bom = text.startsWith("﻿") ? "﻿" : "";
  const body = text.slice(bom.length);
  const doc = parseDocument(body);
  if (doc.errors.length || !keys.length) return null;
  const nameOf = (p: Pair) => (isScalar(p.key) ? String(p.key.value ?? "").trim() : "");
  let node: unknown = doc.contents;
  let siblings: Pair[] = [];
  let pair: Pair | undefined;
  for (const key of keys) {
    if (!isMap(node)) return null;
    siblings = node.items as Pair[];
    pair = siblings.find((p) => nameOf(p) === key);
    if (!pair) return null;
    node = pair.value;
  }
  if (!pair || !isScalar(pair.key) || !pair.key.range || isMap(pair.value) !== group) return null;
  if (siblings.some((p) => p !== pair && nameOf(p) === to)) return "exists";
  const [start, end] = pair.key.range;
  // stringify quotes the name only when YAML needs it.
  return bom + body.slice(0, start) + stringifyYaml(to).trimEnd() + body.slice(end);
}

/** Every YAML-defined wildcard name under `root`. First file (by path) wins on duplicates. */
export async function yamlWildcards(root: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const file of await yamlFiles(root)) {
    const names = await yamlNames(file);
    if (names) for (const [k, v] of names) if (!out.has(k)) out.set(k, v);
  }
  return out;
}

/** Load every wildcard the texts use (and the ones those use) into a resolver. */
export async function loadWildcards(
  folders: readonly string[],
  texts: string[],
  overrides: Record<string, string[]> = {},
): Promise<WildcardResolver> {
  const found = new Map<string, string[]>(Object.entries(overrides));
  const roots = folders.map((r) => r.trim()).filter(Boolean);
  if (!roots.length) return (name) => found.get(name);
  const yaml: Array<Map<string, string[]> | null> = roots.map(() => null);
  const used = [...texts, ...Object.values(overrides).flat()].flatMap(findWildcards);
  let pending = [...new Set(used)];
  for (let depth = 0; pending.length && depth < 10; depth++) {
    const next: string[] = [];
    for (const name of pending) {
      if (found.has(name)) continue;
      let lines: string[] | null = null;
      // Each folder in order: its .txt file, then its YAML keys. The first that has it wins.
      for (let i = 0; i < roots.length && lines === null; i++) {
        const root = roots[i] as string;
        const file = fileFor(root, name);
        if (file) {
          try {
            lines = wildcardLines(await fs.readFile(file, "utf8"));
          } catch {
            lines = null;
          }
        }
        if (lines === null) {
          yaml[i] ??= await yamlWildcards(root);
          lines = yaml[i]?.get(name) ?? null;
        }
      }
      lines ??= [];
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

/**
 * Each wildcard's defining file (the same one that wins in listWildcards: folder order, .txt
 * before YAML) with its dates, size and entry count.
 * shortcut: reads every .txt file on each call; cache by mtime like YAML if big packs get slow.
 */
export async function wildcardStats(
  folders: readonly string[],
): Promise<Record<string, WildcardStat>> {
  const out: Record<string, WildcardStat> = {};
  const stat = async (abs: string) => {
    try {
      const s = await fs.stat(abs);
      return { ctime: s.birthtimeMs || s.ctimeMs, mtime: s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  };
  for (const root of folders.map((r) => r.trim()).filter(Boolean)) {
    const txt: string[] = [];
    await walkFiles(root, (abs) => {
      if (wildcardFormat(abs) === "txt") txt.push(abs);
    });
    for (const abs of txt) {
      const name = txtWildcardName(toRel(path.relative(root, abs)));
      if (out[name]) continue;
      const s = await stat(abs);
      if (!s) continue;
      const lines = wildcardLines(await fs.readFile(abs, "utf8").catch(() => ""));
      out[name] = { ...s, entries: lines.length };
    }
    for (const file of await yamlFiles(root)) {
      const names = await yamlNames(file);
      const s = names?.size ? await stat(file) : null;
      if (!names || !s) continue;
      for (const [name, lines] of names) out[name] ??= { ...s, entries: lines.length };
    }
  }
  return out;
}

/** Wildcard names in the folders ("outfits/fantasy"), from .txt files and YAML keys. */
export async function listWildcards(folders: readonly string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const root of folders.map((r) => r.trim()).filter(Boolean)) {
    await walkFiles(root, (abs) => {
      if (wildcardFormat(abs) === "txt") out.add(txtWildcardName(toRel(path.relative(root, abs))));
    });
    for (const name of (await yamlWildcards(root)).keys()) out.add(name);
  }
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

  /** Everything in this one folder, with paths inside it. */
  async tree(): Promise<{ exists: boolean; entries: WildcardEntry[] }> {
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
    return { exists: exists_, entries };
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
}

/**
 * All of a profile's wildcard folders as one tree for the Wildcard Manager. Paths start with the
 * folder's id ("main/outfits.yaml"), so the client works with plain paths; each folder is a top
 * level folder of the tree. Moves stay inside one folder.
 */
export class WildcardFolders {
  readonly folders: readonly ProfileFolder[];
  private readonly trashDir: string;

  constructor(folders: readonly ProfileFolder[], trashDir: string) {
    this.folders = folders;
    this.trashDir = trashDir;
  }

  private split(p: string): { files: WildcardFiles; rel: string; folder: ProfileFolder } {
    const [id, ...rest] = p.split("/");
    const folder = this.folders.find((f) => f.id === id);
    if (!folder)
      throw new HttpError(
        404,
        this.folders.length
          ? "That wildcard folder isn't in this profile anymore."
          : "Add a wildcards folder in Settings → Folders.",
        "no_folder",
      );
    return {
      files: new WildcardFiles(folder.path, path.join(this.trashDir, folder.id)),
      rel: rest.join("/"),
      folder,
    };
  }

  /** A path inside one of the folders (not a folder itself). */
  private inside(p: string) {
    const parts = this.split(p);
    if (!parts.rel)
      throw new HttpError(400, "Pick a file or folder inside a wildcard folder.", "folder_root");
    return parts;
  }

  async tree(): Promise<WildcardTree> {
    const entries: WildcardEntry[] = [];
    const folders: WildcardTree["folders"] = [];
    const txtOwner = new Map<string, string>();
    const hidden: string[] = [];
    for (const f of this.folders) {
      const sub = await new WildcardFiles(f.path, this.trashDir).tree();
      folders.push({ id: f.id, name: f.name, path: f.path, exists: sub.exists });
      entries.push({ path: f.id, type: "folder", format: null, size: 0, mtime: 0 });
      for (const e of sub.entries) {
        const full = `${f.id}/${e.path}`;
        entries.push({ ...e, path: full });
        if (e.format !== "txt") continue;
        // A .txt name a higher folder already has is never used.
        const name = txtWildcardName(e.path);
        if (txtOwner.has(name)) hidden.push(full);
        else txtOwner.set(name, full);
      }
    }
    return {
      folders,
      entries,
      names: await listWildcards(this.folders.map((f) => f.path)),
      hidden,
    };
  }

  async read(p: string): Promise<WildcardFile> {
    const { files, rel, folder } = this.inside(p);
    return { ...(await files.read(rel)), path: `${folder.id}/${rel}` };
  }

  async save(p: string, text: string, baseMtime: number | null): Promise<WildcardFile> {
    const { files, rel, folder } = this.inside(p);
    return { ...(await files.save(rel, text, baseMtime)), path: `${folder.id}/${rel}` };
  }

  async create(p: string, type: WildcardEntryType): Promise<void> {
    const { files, rel } = this.inside(p);
    await files.create(rel, type);
  }

  /**
   * Move or rename a file or folder in one wildcard folder. Returns what that does to wildcard
   * names (a .txt file's name, or a folder's), so pictures and favorites can follow; a YAML
   * file's keys don't change with its path.
   */
  async move(from: string, to: string): Promise<RenameChange | null> {
    const a = this.inside(from);
    const b = this.inside(to);
    if (a.folder.id !== b.folder.id)
      throw new HttpError(
        400,
        "Files move within one wildcard folder. Copy it in Explorer to use it in another.",
        "other_folder",
      );
    const stat = await fs.stat(resolveInside(a.files.root, a.rel)).catch(() => null);
    await a.files.move(a.rel, b.rel);
    if (stat?.isDirectory())
      return { kind: "wildcard", from: trimSlash(a.rel), to: trimSlash(b.rel), folder: true };
    if (wildcardFormat(a.rel) === "txt" && wildcardFormat(b.rel) === "txt")
      return {
        kind: "wildcard",
        from: txtWildcardName(a.rel),
        to: txtWildcardName(b.rel),
        folder: false,
      };
    return null;
  }

  async remove(p: string): Promise<string> {
    const { files, rel } = this.inside(p);
    return files.remove(rel);
  }

  /**
   * Where a picker's wildcard comes from, in lookup order (each folder: its .txt file, then its
   * YAML keys), with its entry count and the first few entries.
   */
  async info(name: string): Promise<WildcardInfo> {
    const rel = name.replace(/\\/g, "/");
    for (const f of this.folders) {
      const root = f.path.trim();
      if (!root) continue;
      const file = fileFor(root, rel);
      const text = file ? await fs.readFile(file, "utf8").catch(() => null) : null;
      if (file && text !== null) {
        const lines = wildcardLines(text);
        return {
          name: rel,
          path: `${f.id}/${toRel(path.relative(root, file))}`,
          format: "txt",
          folder: f.name,
          count: lines.length,
          sample: lines.slice(0, WILDCARD_SAMPLE),
        };
      }
      for (const yaml of await yamlFiles(root)) {
        const lines = (await yamlNames(yaml))?.get(rel);
        if (lines)
          return {
            name: rel,
            path: `${f.id}/${toRel(path.relative(root, yaml))}`,
            format: "yaml",
            folder: f.name,
            count: lines.length,
            sample: lines.slice(0, WILDCARD_SAMPLE),
          };
      }
    }
    throw new HttpError(404, `No wildcard named "${rel}" in this profile's folders.`, "not_found");
  }

  /** A pickers' folder ("people/actors", the same in every folder) in the first folder with it. */
  async folderPath(folder: string): Promise<string> {
    for (const f of this.folders) {
      if (!f.path.trim()) continue;
      const dir = resolveInside(f.path, folder);
      if (await isDir(dir)) return dir;
    }
    throw new HttpError(
      404,
      "That folder isn't on disk: it may be a group inside a .yaml file.",
      "no_folder",
    );
  }

  /**
   * Rename a picker's wildcard where it's defined, in lookup order (each folder: its .txt file,
   * then the first YAML file with that key), or a picker's folder everywhere it exists (folders
   * on disk and groups in YAML files, in every wildcards folder, so the name keeps working).
   * Everything is checked before anything changes. Returns the change made.
   */
  async rename(name: string, to: string, folder: boolean): Promise<RenameChange> {
    const rel = name.replace(/\\/g, "/");
    const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
    const change: RenameChange = { kind: "wildcard", from: rel, to: parent + to, folder };
    const keys = rel.split("/");
    const moves: Array<{ from: string; to: string }> = [];
    const edits: Array<{ file: string; text: string }> = [];
    const taken = (where: string) =>
      new HttpError(409, `"${to}" already exists in ${where}. Pick another name.`, "exists");
    /** Rename the key in one YAML file; false when the file doesn't have it. */
    const editYaml = async (file: string): Promise<boolean> => {
      const text = await fs.readFile(file, "utf8").catch(() => null);
      const next = text === null ? null : renameYamlKey(text, keys, to, folder);
      if (next === "exists") throw taken(path.basename(file));
      if (next === null) return false;
      edits.push({ file, text: next });
      return true;
    };
    search: for (const f of this.folders) {
      const root = f.path.trim();
      if (!root) continue;
      const src = resolveInside(root, folder ? rel : `${rel}.txt`);
      const dest = resolveInside(root, folder ? change.to : `${change.to}.txt`);
      const stat = await fs.stat(src).catch(() => null);
      if (stat && stat.isDirectory() === folder) {
        if (src.toLowerCase() !== dest.toLowerCase() && (await exists(dest))) throw taken(f.name);
        moves.push({ from: src, to: dest });
        if (!folder) break;
      }
      for (const file of await yamlFiles(root)) {
        if (!folder && !(await yamlNames(file))?.has(rel)) continue;
        if ((await editYaml(file)) && !folder) break search;
      }
    }
    if (!moves.length && !edits.length)
      throw new HttpError(
        404,
        folder
          ? `No folder or YAML group named "${rel}" in this profile's wildcards.`
          : `No wildcard named "${rel}" in this profile's folders.`,
        "not_found",
      );
    for (const m of moves) await movePath(m.from, m.to);
    for (const e of edits) await writeFileAtomic(e.file, e.text);
    return change;
  }

  /** Update full references to renamed LoRAs and wildcards in every wildcard file. */
  async renameRefs(changes: readonly RenameChange[]): Promise<{ files: number }> {
    const files: string[] = [];
    for (const f of this.folders)
      if (f.path.trim()) await walkFiles(f.path, (abs) => files.push(abs));
    let changed = 0;
    for (const file of files) {
      const text = await fs.readFile(file, "utf8").catch(() => null);
      if (text === null) continue;
      const next = changes.reduce((t, c) => renameRefs(t, c), text);
      if (next === text) continue;
      await writeFileAtomic(file, next);
      changed++;
    }
    return { files: changed };
  }

  /** The file or folder on disk (the folder itself for a bare id), for Reveal. */
  abs(p: string): string {
    const { folder, rel } = this.split(p);
    return rel ? resolveInside(folder.path, rel) : folder.path;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
