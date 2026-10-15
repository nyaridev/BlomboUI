/**
 * Local models: the files under the profile's models root, by kind (MODEL_FOLDERS), with their
 * sidecars: a thumbnail image and Civitai or A1111 info JSON next to the model.
 *
 * A scan reads each folder once and only the small sidecar JSON files, so a thousand LoRAs list
 * quickly; the result is cached until a rename, a move or a rescan. Renaming or moving takes the
 * sidecars along. Nothing is ever deleted from the models folder.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { MODEL_KINDS, type ModelKind } from "../../shared/constants.ts";
import {
  type LocalModel,
  MODEL_EXTENSIONS,
  MODEL_FOLDERS,
  type ModelDetails,
  ModelFileStem,
  type ModelList,
  shortBaseModel,
  THUMB_SUFFIXES,
} from "../../shared/models.ts";
import { headerLength, parseSafetensorsHeader } from "../../shared/safetensors.ts";
import { exists, movePath, resolveInside } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { ThumbCache } from "../lib/thumbs.ts";
import type { ProfileService } from "./profiles.ts";

export const MODEL_THUMB_MAX = 480;
const EXTENSIONS = new Set<string>(MODEL_EXTENSIONS);

export interface ModelDeps {
  profiles: ProfileService;
  runtimeDir: string;
  /** Model files changed on disk (ComfyUI's lists and open windows should refresh). */
  onChanged: () => void;
}

interface Sidecars {
  thumb: string | null;
  civitai: string | null;
  json: string | null;
  all: string[];
}

interface Entry {
  model: LocalModel;
  abs: string;
  sidecars: Sidecars;
}

interface CivitaiInfo {
  id?: unknown;
  modelId?: unknown;
  name?: unknown;
  baseModel?: unknown;
  trainedWords?: unknown;
  description?: unknown;
  model?: { name?: unknown; nsfw?: unknown; description?: unknown };
  creator?: { username?: unknown };
  images?: Array<{ nsfw?: unknown; nsfwLevel?: unknown }>;
}

interface A1111Info {
  description?: unknown;
  "sd version"?: unknown;
  "activation text"?: unknown;
  "preferred weight"?: unknown;
  notes?: unknown;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function readJson<T>(file: string | null): Promise<T | null> {
  if (!file) return null;
  try {
    return JSON.parse((await fs.readFile(file, "utf8")).replace(/^﻿/, "")) as T;
  } catch {
    return null;
  }
}

function isNsfw(info: CivitaiInfo | null): boolean {
  if (!info) return false;
  if (info.model?.nsfw === true) return true;
  const first = info.images?.[0];
  if (!first) return false;
  if (typeof first.nsfwLevel === "number") return first.nsfwLevel >= 4;
  if (typeof first.nsfw === "string")
    return !["none", "false", ""].includes(first.nsfw.toLowerCase());
  return first.nsfw === true;
}

/** Stem of a model file ("foo.safetensors" → "foo"). */
const stemOf = (file: string) => file.slice(0, file.length - path.extname(file).length);

/** Files in one folder that belong to a model stem ("foo.preview.png", "foo.civitai.info"…). */
function sidecarsFor(stem: string, files: Map<string, string>, dir: string): Sidecars {
  const lower = stem.toLowerCase();
  const pick = (suffix: string) => {
    const name = files.get(lower + suffix);
    return name ? path.join(dir, name) : null;
  };
  let thumb: string | null = null;
  for (const s of THUMB_SUFFIXES) {
    thumb = pick(s);
    if (thumb) break;
  }
  const all: string[] = [];
  for (const [low, name] of files)
    if (low.startsWith(`${lower}.`) && !EXTENSIONS.has(path.extname(low))) all.push(name);
  return { thumb, civitai: pick(".civitai.info"), json: pick(".json"), all };
}

export class ModelService {
  private readonly deps: ModelDeps;
  private cache: {
    profileId: string;
    root: string;
    list: ModelList;
    entries: Map<string, Entry>;
  } | null = null;
  private scanning: Promise<void> | null = null;

  constructor(deps: ModelDeps) {
    this.deps = deps;
  }

  private async root(): Promise<{ profileId: string; root: string }> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const profile = await this.deps.profiles.get(profileId);
    return { profileId, root: profile.paths.models.trim() };
  }

  private thumbs(profileId: string): ThumbCache {
    return new ThumbCache(path.join(this.deps.runtimeDir, "cache", profileId, "thumbs", "models"));
  }

  invalidate(): void {
    this.cache = null;
  }

  async list(force = false): Promise<ModelList> {
    const { profileId, root } = await this.root();
    if (!force && this.cache?.profileId === profileId && this.cache.root === root)
      return this.cache.list;
    if (this.scanning) await this.scanning;
    else {
      this.scanning = this.scan(profileId, root).finally(() => {
        this.scanning = null;
      });
      await this.scanning;
    }
    if (!this.cache) throw new HttpError(500, "Couldn't read the models folder.", "scan_failed");
    return this.cache.list;
  }

  private async scan(profileId: string, root: string): Promise<void> {
    const entries = new Map<string, Entry>();
    const rootExists = Boolean(root) && (await isDir(root));
    if (rootExists)
      for (const kind of MODEL_KINDS)
        for (const folder of MODEL_FOLDERS[kind]) {
          const base = path.join(root, folder);
          if (await isDir(base)) await this.scanFolder(root, base, kind, entries);
        }
    const models = [...entries.values()]
      .map((e) => e.model)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    this.cache = {
      profileId,
      root,
      entries,
      list: {
        root,
        exists: rootExists,
        models,
        totalSize: models.reduce((n, m) => n + m.size, 0),
        scannedAt: Date.now(),
      },
    };
  }

  private async scanFolder(
    root: string,
    dir: string,
    kind: ModelKind,
    out: Map<string, Entry>,
    depth = 0,
  ): Promise<void> {
    if (depth > 12) return;
    let items: Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const files = new Map<string, string>();
    for (const e of items) if (e.isFile()) files.set(e.name.toLowerCase(), e.name);
    const kindRoot = kindFolderOf(root, dir);
    for (const e of items) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await this.scanFolder(root, full, kind, out, depth + 1);
        continue;
      }
      if (!e.isFile() || !EXTENSIONS.has(path.extname(e.name).toLowerCase())) continue;
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const stem = stemOf(e.name);
      const sidecars = sidecarsFor(stem, files, dir);
      const civitai = await readJson<CivitaiInfo>(sidecars.civitai);
      const a1111 = await readJson<A1111Info>(sidecars.json);
      const id = toRel(path.relative(root, full));
      let thumb: string | null = null;
      if (sidecars.thumb) {
        const t = await fs.stat(sidecars.thumb).catch(() => null);
        if (t)
          thumb = `/api/models/thumb?id=${encodeURIComponent(id)}&v=${t.size.toString(36)}-${Math.round(t.mtimeMs).toString(36)}`;
      }
      const trained = Array.isArray(civitai?.trainedWords)
        ? civitai.trainedWords.filter((w): w is string => typeof w === "string" && w.trim() !== "")
        : [];
      const activation = str(a1111?.["activation text"]);
      out.set(id, {
        abs: full,
        sidecars,
        model: {
          id,
          kind,
          name: str(civitai?.model?.name) ?? stem,
          file: e.name,
          folder: toRel(path.relative(kindRoot, dir)),
          size: stat.size,
          mtime: stat.mtimeMs,
          thumb,
          nsfw: isNsfw(civitai),
          baseModel: shortBaseModel(str(civitai?.baseModel) ?? str(a1111?.["sd version"])),
          triggerWords: trained.length
            ? trained.map((w) => w.trim())
            : activation
              ? activation
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean)
              : [],
          hasInfo: Boolean(civitai || a1111),
        },
      });
    }
  }

  private async entry(id: string): Promise<{ entry: Entry; root: string; profileId: string }> {
    await this.list();
    const cache = this.cache;
    const entry = cache?.entries.get(id);
    if (!cache || !entry)
      throw new HttpError(404, "That model isn't in the models folder anymore.", "no_model");
    return { entry, root: cache.root, profileId: cache.profileId };
  }

  async thumbFile(id: string): Promise<string> {
    const { entry, profileId } = await this.entry(id);
    if (!entry.sidecars.thumb) throw new HttpError(404, "No thumbnail.", "no_thumb");
    const stat = await fs.stat(entry.sidecars.thumb);
    return this.thumbs(profileId).get(
      entry.sidecars.thumb,
      `${stat.size}-${stat.mtimeMs}`,
      MODEL_THUMB_MAX,
    );
  }

  async filePath(id: string): Promise<string> {
    return (await this.entry(id)).entry.abs;
  }

  async details(id: string): Promise<ModelDetails> {
    const { entry, root } = await this.entry(id);
    const civitai = await readJson<CivitaiInfo>(entry.sidecars.civitai);
    const a1111 = await readJson<A1111Info>(entry.sidecars.json);
    let header: ModelDetails["header"] = null;
    let headerError: string | null = null;
    if (/\.(safetensors|sft)$/i.test(entry.model.file)) {
      try {
        header = await readSafetensorsHeader(entry.abs);
      } catch (error) {
        headerError = `Couldn't read the file header: ${error instanceof Error ? error.message : error}`;
      }
    }
    const modelId = typeof civitai?.modelId === "number" ? civitai.modelId : null;
    const versionId = typeof civitai?.id === "number" ? civitai.id : null;
    const weight = Number(a1111?.["preferred weight"]);
    const kindRoot = kindFolderOf(root, path.dirname(entry.abs));
    return {
      ...entry.model,
      path: entry.abs,
      sidecars: entry.sidecars.all,
      description:
        str(civitai?.model?.description) ?? str(civitai?.description) ?? str(a1111?.description),
      notes: str(a1111?.notes),
      civitai: civitai
        ? {
            modelId,
            versionId,
            name: str(civitai.model?.name),
            version: str(civitai.name),
            creator: str(civitai.creator?.username),
            url: modelId
              ? `https://civitai.com/models/${modelId}${versionId ? `?modelVersionId=${versionId}` : ""}`
              : null,
          }
        : null,
      weight: Number.isFinite(weight) && weight > 0 ? weight : null,
      header,
      headerError,
      folders: await subfolders(kindRoot),
    };
  }

  /** Rename the model file and its sidecars ("foo.*" → "bar.*"). */
  async rename(id: string, name: string): Promise<LocalModel> {
    const { entry } = await this.entry(id);
    const dir = path.dirname(entry.abs);
    const oldStem = stemOf(entry.model.file);
    const parsed = ModelFileStem.safeParse(name);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid name.", "bad_name");
    const newStem = parsed.data;
    if (newStem === oldStem) return entry.model;
    const moves = [entry.model.file, ...entry.sidecars.all].map((file) => ({
      from: path.join(dir, file),
      to: path.join(dir, newStem + file.slice(oldStem.length)),
    }));
    return this.moveAll(moves, entry, path.join(dir, newStem + path.extname(entry.model.file)));
  }

  /** Move the model and its sidecars to another folder inside the same kind folder. */
  async move(id: string, folder: string): Promise<LocalModel> {
    const { entry, root } = await this.entry(id);
    const kindRoot = kindFolderOf(root, path.dirname(entry.abs));
    const target = folder.trim() ? resolveInside(kindRoot, folder.trim()) : kindRoot;
    const dir = path.dirname(entry.abs);
    if (path.resolve(target).toLowerCase() === path.resolve(dir).toLowerCase()) return entry.model;
    const moves = [entry.model.file, ...entry.sidecars.all].map((file) => ({
      from: path.join(dir, file),
      to: path.join(target, file),
    }));
    return this.moveAll(moves, entry, path.join(target, entry.model.file));
  }

  private async moveAll(
    moves: Array<{ from: string; to: string }>,
    entry: Entry,
    newAbs: string,
  ): Promise<LocalModel> {
    for (const m of moves)
      if (
        path.resolve(m.from).toLowerCase() !== path.resolve(m.to).toLowerCase() &&
        (await exists(m.to))
      )
        throw new HttpError(
          409,
          `"${path.basename(m.to)}" already exists there. Pick another name.`,
          "exists",
        );
    const done: Array<{ from: string; to: string }> = [];
    try {
      for (const m of moves) {
        await movePath(m.from, m.to);
        done.push(m);
      }
    } catch (error) {
      // Put back what already moved so the model and its sidecars stay together.
      for (const m of done.reverse()) await movePath(m.to, m.from).catch(() => undefined);
      const code = (error as NodeJS.ErrnoException).code;
      throw new HttpError(
        409,
        code === "EBUSY" || code === "EPERM"
          ? `"${entry.model.file}" is in use. Unload models in ComfyUI (header → VRAM menu), then try again.`
          : `Couldn't move "${entry.model.file}": ${error instanceof Error ? error.message : error}`,
        "move_failed",
      );
    }
    this.invalidate();
    this.deps.onChanged();
    const { root } = await this.root();
    const list = await this.list();
    const id = toRel(path.relative(root, newAbs));
    const model = list.models.find((m) => m.id === id);
    if (!model)
      throw new HttpError(
        500,
        "The model moved but couldn't be found again. Rescan models.",
        "lost",
      );
    return model;
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

const toRel = (p: string) => p.split(path.sep).join("/");

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** The kind folder ("<root>/loras") that contains `dir`. */
function kindFolderOf(root: string, dir: string): string {
  const rel = path.relative(root, dir).split(path.sep);
  return path.join(root, rel[0] ?? "");
}

async function subfolders(
  dir: string,
  prefix = "",
  depth = 0,
  out: string[] = [],
): Promise<string[]> {
  if (depth > 6 || out.length > 500) return out;
  let items: Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of items)
    if (e.isDirectory() && !e.name.startsWith(".")) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      out.push(rel);
      await subfolders(path.join(dir, e.name), rel, depth + 1, out);
    }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Parse a safetensors file's header without reading its tensors. */
export async function readSafetensorsHeader(file: string) {
  const handle = await fs.open(file, "r");
  try {
    const first = new Uint8Array(8);
    await handle.read(first, 0, 8, 0);
    const n = headerLength(first);
    if (n === null) throw new Error("not a safetensors file");
    const json = new Uint8Array(n);
    await handle.read(json, 0, n, 8);
    return parseSafetensorsHeader(new TextDecoder("utf-8").decode(json));
  } finally {
    await handle.close();
  }
}
