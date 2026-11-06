/**
 * Local models: the files under the profile's model folders, by kind (MODEL_FOLDERS), with their
 * sidecars: Civitai or A1111 info JSON next to the model, and its pictures in the folder named
 * after it (`<model>_data/thumb.*`, services/modelthumbs.ts).
 *
 * A scan reads each folder once and only the small sidecar JSON files, so a thousand LoRAs list
 * quickly; the result is cached until a rename, a move or a rescan. Renaming or moving takes the
 * sidecars along. The model info dialog writes trigger words, strength and notes into the A1111
 * .json and replaces the picture (the old one goes to the profile's trash). Nothing is ever
 * deleted from the models folder.
 *
 * A profile can have several model folders (ADR-0017). They're scanned in order and a model's id
 * is its path inside its folder, as ComfyUI names it, so when two folders hold the same file the
 * higher one wins, as in ComfyUI. Renames and moves stay inside the model's own folder.
 *
 * Models without a .civitai.info file are filled in from the background lookup by hash
 * (services/lookup.ts): name, thumbnail, base model and trigger words, kept in the profile's
 * database, never written next to the model.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { CIVITAI_SITE_URLS } from "../../shared/civitai.ts";
import { MODEL_KINDS, type ModelKind } from "../../shared/constants.ts";
import {
  comfyNameOf,
  DEFAULT_STRENGTH_RANGE,
  type LocalModel,
  type LookupInfo,
  MODEL_EXTENSIONS,
  MODEL_FOLDERS,
  type ModelDetails,
  ModelFileStem,
  type ModelList,
  type SaveModelInfoBody,
  StrengthRange,
  shortBaseModel,
} from "../../shared/models.ts";
import type { ProfileFolder } from "../../shared/profile.ts";
import { headerLength, parseSafetensorsHeader } from "../../shared/safetensors.ts";
import { exists, movePath, resolveInside, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { ThumbCache } from "../lib/thumbs.ts";
import { DATA_SUFFIX, dataDirOf, findThumbs, RAW_TYPES, saveModelThumbs } from "./modelthumbs.ts";
import type { ProfileService } from "./profiles.ts";

export const MODEL_THUMB_MAX = 480;
const EXTENSIONS = new Set<string>(MODEL_EXTENSIONS);

export interface ModelDeps {
  profiles: ProfileService;
  runtimeDir: string;
  /** Model files changed on disk (ComfyUI's lists and open windows should refresh). */
  onChanged: () => void;
  /** The Civitai site model links point at (the profile's choice; civitai.com when unset). */
  civitaiSite?: () => string;
  /** What a lookup by hash found for a file (same size and mtime), if anything. */
  lookup?: (profileId: string, id: string, size: number, mtime: number) => LookupInfo | null;
  /** A hash the background lookup already worked out for this file, or null. */
  hash?: (profileId: string, id: string, size: number, mtime: number) => string | null;
  /** Models moved or were renamed (ComfyUI names before and after): favorites follow. */
  onRenamed?: (
    kind: ModelKind,
    changes: Array<{ from: string; to: string; folder: boolean }>,
  ) => void;
}

interface Sidecars {
  /** The picture cards show (`<model>_data/thumb.*`). */
  thumb: string | null;
  /** The full-size picture (`<model>_data/thumb_raw.*`) when it's an image. */
  raw: string | null;
  civitai: string | null;
  json: string | null;
  /** The model's data folder (`<model>_data`), if it has one. */
  dataDir: string | null;
  /** Everything that moves with the model: "foo.*" files and the data folder. */
  all: string[];
}

interface Entry {
  model: LocalModel;
  abs: string;
  /** The model folder it's in. */
  root: string;
  sidecars: Sidecars;
  lookup: LookupInfo | null;
}

interface CivitaiInfo {
  id?: unknown;
  modelId?: unknown;
  name?: unknown;
  baseModel?: unknown;
  trainedWords?: unknown;
  description?: unknown;
  model?: { name?: unknown; description?: unknown };
  creator?: { username?: unknown };
  files?: Array<{ name?: unknown; primary?: unknown; hashes?: { SHA256?: unknown } }>;
}

interface A1111Info {
  description?: unknown;
  "sd version"?: unknown;
  "activation text"?: unknown;
  "preferred weight"?: unknown;
  notes?: unknown;
  /** Blombo's own: false puts the LoRA in the prompt as a tag instead (instant is the default). */
  "instant lora"?: unknown;
  /** Blombo's own: "start" or "end", where an instant LoRA's trigger words go. */
  "trigger position"?: unknown;
  /** Blombo's own: [lowest, highest] for the strength slider. */
  "strength range"?: unknown;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A saved slider range, or the default when it's missing or broken (it's hand-editable). */
function readRange(v: unknown): [number, number] {
  const r = StrengthRange.safeParse(v);
  return r.success ? r.data : DEFAULT_STRENGTH_RANGE;
}

async function readJson<T>(file: string | null): Promise<T | null> {
  if (!file) return null;
  try {
    return JSON.parse((await fs.readFile(file, "utf8")).replace(/^﻿/, "")) as T;
  } catch {
    return null;
  }
}

/** Stem of a model file ("foo.safetensors" → "foo"). */
const stemOf = (file: string) => file.slice(0, file.length - path.extname(file).length);

/**
 * What in one folder belongs to a model stem: "foo.civitai.info" and other "foo.*" files, and
 * the "foo_data" folder (`dirs`: the folder's subfolders, lowercase → name). `stems` are the
 * folder's model stems (lowercase): a file that also starts with a longer one
 * ("foo.xl.civitai.info" next to foo.xl.safetensors) belongs to that model, not to "foo".
 * The picture is filled in by the scan (it needs a read of the data folder).
 */
export function sidecarsFor(
  stem: string,
  files: Map<string, string>,
  dir: string,
  stems: string[] = [],
  dirs: Map<string, string> = new Map(),
): Sidecars {
  const lower = stem.toLowerCase();
  const longer = stems.filter((t) => t !== lower && t.startsWith(`${lower}.`));
  const pick = (suffix: string) => {
    const name = files.get(lower + suffix);
    return name ? path.join(dir, name) : null;
  };
  const dataName = dirs.get(lower + DATA_SUFFIX) ?? null;
  const all: string[] = dataName ? [dataName] : [];
  for (const [low, name] of files)
    if (
      low.startsWith(`${lower}.`) &&
      !EXTENSIONS.has(path.extname(low)) &&
      !longer.some((t) => low.startsWith(`${t}.`))
    )
      all.push(name);
  return {
    thumb: null,
    raw: null,
    civitai: pick(".civitai.info"),
    json: pick(".json"),
    dataDir: dataName ? path.join(dir, dataName) : null,
    all,
  };
}

export class ModelService {
  private readonly deps: ModelDeps;
  private cache: {
    profileId: string;
    /** The folders it was scanned from (a change means a new scan). */
    key: string;
    list: ModelList;
    entries: Map<string, Entry>;
  } | null = null;
  private scanning: Promise<void> | null = null;
  /** Bumped by invalidate(): a scan that started before it doesn't fill the cache. */
  private generation = 0;

  constructor(deps: ModelDeps) {
    this.deps = deps;
  }

  private async folders(): Promise<{ profileId: string; folders: ProfileFolder[]; key: string }> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const folders = (await this.deps.profiles.get(profileId)).folders.models;
    return { profileId, folders, key: JSON.stringify(folders) };
  }

  private thumbs(profileId: string): ThumbCache {
    return new ThumbCache(path.join(this.deps.runtimeDir, "cache", profileId, "thumbs", "models"));
  }

  invalidate(): void {
    this.cache = null;
    this.generation++;
  }

  async list(force = false): Promise<ModelList> {
    if (force) this.invalidate();
    // A scan already running may be for another profile or folder, or older than a change:
    // wait for it, then scan again unless the cache now matches.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { profileId, folders, key } = await this.folders();
      const cache = this.cache;
      if (cache?.profileId === profileId && cache.key === key) return cache.list;
      if (this.scanning) {
        await this.scanning.catch(() => undefined);
        continue;
      }
      this.scanning = this.scan(profileId, folders, key, this.generation).finally(() => {
        this.scanning = null;
      });
      await this.scanning;
    }
    throw new HttpError(
      503,
      "The models folder keeps changing; try again in a moment.",
      "scan_busy",
    );
  }

  private async scan(
    profileId: string,
    folders: ProfileFolder[],
    key: string,
    generation: number,
  ): Promise<void> {
    const entries = new Map<string, Entry>();
    const listed: ModelList["folders"] = [];
    for (const f of folders) {
      const root = f.path.trim();
      const found = Boolean(root) && (await isDir(root));
      listed.push({ id: f.id, name: f.name, path: root, exists: found });
      if (!found) continue;
      for (const kind of MODEL_KINDS)
        for (const folder of MODEL_FOLDERS[kind]) {
          const base = path.join(root, folder);
          if (await isDir(base))
            await this.scanFolder(profileId, { id: f.id, path: root }, base, kind, entries);
        }
    }
    const models = [...entries.values()]
      .map((e) => e.model)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    if (generation !== this.generation) return;
    this.cache = {
      profileId,
      key,
      entries,
      list: {
        root: listed[0]?.path ?? "",
        exists: listed.some((f) => f.exists),
        folders: listed,
        models,
        totalSize: models.reduce((n, m) => n + m.size, 0),
        scannedAt: Date.now(),
      },
    };
  }

  private async scanFolder(
    profileId: string,
    from: { id: string; path: string },
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
    const dirs = new Map<string, string>();
    for (const e of items)
      if (e.isFile()) files.set(e.name.toLowerCase(), e.name);
      else if (e.isDirectory()) dirs.set(e.name.toLowerCase(), e.name);
    const stems = [...files.keys()]
      .filter((low) => EXTENSIONS.has(path.extname(low)))
      .map((low) => stemOf(low));
    const root = from.path;
    const kindRoot = kindFolderOf(root, dir);
    for (const e of items) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // A model's data folder holds its pictures, not more models.
        if (isModelDataDir(e.name, stems)) continue;
        await this.scanFolder(profileId, from, full, kind, out, depth + 1);
        continue;
      }
      if (!e.isFile() || !EXTENSIONS.has(path.extname(e.name).toLowerCase())) continue;
      // The same file in a higher folder wins (ComfyUI picks that one too).
      const id = toRel(path.relative(root, full));
      if (out.has(id)) continue;
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const stem = stemOf(e.name);
      const sidecars = sidecarsFor(stem, files, dir, stems, dirs);
      if (sidecars.dataDir) {
        const pictures = await findThumbs(sidecars.dataDir);
        sidecars.thumb = pictures.thumb;
        if (pictures.raw && RAW_TYPES[path.extname(pictures.raw).toLowerCase()])
          sidecars.raw = pictures.raw;
      }
      const civitai = await readJson<CivitaiInfo>(sidecars.civitai);
      const a1111 = await readJson<A1111Info>(sidecars.json);
      let thumb: string | null = null;
      if (sidecars.thumb) {
        const t = await fs.stat(sidecars.thumb).catch(() => null);
        if (t)
          thumb = `/api/models/thumb?id=${encodeURIComponent(id)}&v=${t.size.toString(36)}-${Math.round(t.mtimeMs).toString(36)}`;
      }
      let rawThumb: string | null = null;
      if (sidecars.raw) {
        const t = await fs.stat(sidecars.raw).catch(() => null);
        if (t)
          rawThumb = `/api/models/picture/raw?id=${encodeURIComponent(id)}&v=${t.size.toString(36)}-${Math.round(t.mtimeMs).toString(36)}`;
      }
      const ids = civitaiIds(civitai);
      // Without a Civitai info file, what a lookup by hash found fills the gaps.
      const found = ids
        ? null
        : (this.deps.lookup?.(profileId, id, stat.size, stat.mtimeMs) ?? null);
      const trained = Array.isArray(civitai?.trainedWords)
        ? civitai.trainedWords.filter((w): w is string => typeof w === "string" && w.trim() !== "")
        : (found?.trainedWords ?? []);
      const activation = str(a1111?.["activation text"]);
      const weight = Number(a1111?.["preferred weight"]);
      out.set(id, {
        abs: full,
        root,
        sidecars,
        lookup: found,
        model: {
          id,
          root: from.id,
          kind,
          name: str(civitai?.model?.name) ?? found?.name ?? stem,
          file: e.name,
          folder: toRel(path.relative(kindRoot, dir)),
          size: stat.size,
          mtime: stat.mtimeMs,
          ctime: stat.birthtimeMs,
          thumb: thumb ?? found?.image ?? null,
          rawThumb,
          baseModel: shortBaseModel(
            str(civitai?.baseModel) ?? str(a1111?.["sd version"]) ?? found?.baseModel ?? null,
          ),
          // Your own words (A1111's activation text) win over Civitai's list.
          triggerWords: activation
            ? activation
                .split(",")
                .map((w) => w.trim())
                .filter(Boolean)
            : trained.map((w) => w.trim()),
          weight: Number.isFinite(weight) && weight !== 0 ? weight : null,
          strengthRange: readRange(a1111?.["strength range"]),
          instant: a1111?.["instant lora"] !== false,
          triggerAt: a1111?.["trigger position"] === "end" ? "end" : "start",
          hasInfo: Boolean(civitai || a1111),
          civitai: ids
            ? { ...ids, lookup: false }
            : found
              ? { modelId: found.modelId, versionId: found.versionId, lookup: true }
              : null,
          sha256:
            infoHash(civitai, e.name) ??
            this.deps.hash?.(profileId, id, stat.size, stat.mtimeMs) ??
            null,
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
    return { entry, root: entry.root, profileId: cache.profileId };
  }

  /** The full-size picture of a local model and how to serve it. */
  async rawPicture(id: string): Promise<{ file: string; type: string }> {
    const { entry } = await this.entry(id);
    const type = entry.sidecars.raw
      ? RAW_TYPES[path.extname(entry.sidecars.raw).toLowerCase()]
      : undefined;
    if (!entry.sidecars.raw || !type)
      throw new HttpError(404, "This model has no full-size picture.", "no_picture");
    return { file: entry.sidecars.raw, type };
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

  /**
   * A picker's folder on disk: the first of the profile's models folders that has it below one
   * of the kind's folders (a higher folder wins, as for files).
   */
  async folderPath(kind: ModelKind, folder: string, rootId?: string): Promise<string> {
    const list = await this.list();
    for (const root of list.folders.filter((f) => f.exists && (!rootId || f.id === rootId)))
      for (const name of MODEL_FOLDERS[kind]) {
        const dir = resolveInside(path.join(root.path, name), folder);
        if (await isDir(dir)) return dir;
      }
    throw new HttpError(
      404,
      "That folder isn't in this profile's models folders. ComfyUI may list it from another path.",
      "no_folder",
    );
  }

  /** Rename a folder below a kind folder (its models, sidecars and pictures go with it). */
  async renameFolder(
    kind: ModelKind,
    folder: string,
    name: string,
    rootId?: string,
  ): Promise<void> {
    const parsed = ModelFileStem.safeParse(name);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid name.", "bad_name");
    const dir = await this.folderPath(kind, folder, rootId);
    const target = path.join(path.dirname(dir), parsed.data);
    if (path.resolve(target) === path.resolve(dir)) return;
    // A case-only change is the same folder on Windows; anything else must be free.
    if (
      path.resolve(target).toLowerCase() !== path.resolve(dir).toLowerCase() &&
      (await exists(target))
    )
      throw new HttpError(
        409,
        `"${parsed.data}" already exists there. Pick another name.`,
        "exists",
      );
    await movePath(dir, target);
    const from = folder.replace(/\\/g, "/").replace(/\/+$/, "");
    const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
    this.deps.onRenamed?.(kind, [{ from, to: parent + parsed.data, folder: true }]);
    this.changed();
  }

  /** The file of a local model by kind and ComfyUI name, or null when it isn't in the folder. */
  async fileFor(kind: ModelKind, comfyName: string): Promise<string | null> {
    const list = await this.list();
    const want = comfyName.replace(/\\/g, "/");
    const model = list.models.find((m) => m.kind === kind && comfyNameOf(m) === want);
    return model ? (this.cache?.entries.get(model.id)?.abs ?? null) : null;
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
    const found = entry.lookup;
    const modelId =
      typeof civitai?.modelId === "number" ? civitai.modelId : (found?.modelId ?? null);
    const versionId = typeof civitai?.id === "number" ? civitai.id : (found?.versionId ?? null);
    const site = this.deps.civitaiSite?.() ?? CIVITAI_SITE_URLS.com;
    const kindRoot = kindFolderOf(root, path.dirname(entry.abs));
    return {
      ...entry.model,
      path: entry.abs,
      sidecars: entry.sidecars.all,
      description:
        str(civitai?.model?.description) ??
        str(civitai?.description) ??
        str(a1111?.description) ??
        found?.description ??
        null,
      notes: str(a1111?.notes),
      civitai:
        civitai || found
          ? {
              modelId,
              versionId,
              name: str(civitai?.model?.name) ?? found?.name ?? null,
              version: str(civitai?.name) ?? found?.version ?? null,
              creator: str(civitai?.creator?.username) ?? found?.creator ?? null,
              url: modelId
                ? `${site}/models/${modelId}${versionId ? `?modelVersionId=${versionId}` : ""}`
                : null,
            }
          : null,
      picture: entry.sidecars.thumb !== null,
      header,
      headerError,
      folders: await subfolders(kindRoot),
    };
  }

  /**
   * Save trigger words, strength, notes and the instant LoRA settings into the model's A1111 .json ("foo.json", made when
   * missing). Other keys in it are kept; a file that isn't valid JSON is left alone.
   */
  async saveInfo(body: SaveModelInfoBody): Promise<ModelDetails> {
    const { entry } = await this.entry(body.id);
    const file =
      entry.sidecars.json ?? path.join(path.dirname(entry.abs), `${stemOf(entry.model.file)}.json`);
    let info: Record<string, unknown> = {};
    if (await exists(file)) {
      const read = await readJson<unknown>(file);
      if (!read || typeof read !== "object" || Array.isArray(read))
        throw new HttpError(
          409,
          `"${path.basename(file)}" next to the model isn't valid JSON. Fix or move it, then save again.`,
          "bad_json",
        );
      info = read as Record<string, unknown>;
    }
    if (body.triggerWords) info["activation text"] = body.triggerWords.join(", ");
    if (body.weight !== undefined) info["preferred weight"] = body.weight ?? 0;
    if (body.notes !== undefined) info.notes = body.notes.trim();
    if (body.instant !== undefined) info["instant lora"] = body.instant;
    if (body.triggerAt !== undefined) info["trigger position"] = body.triggerAt;
    if (body.strengthRange === null) delete info["strength range"];
    else if (body.strengthRange) info["strength range"] = body.strengthRange;
    await writeJsonAtomic(file, info);
    this.changed();
    return this.details(body.id);
  }

  /** Make an image the model's picture; the old one moves to the profile's trash. */
  async setPicture(id: string, image: Uint8Array): Promise<void> {
    const { entry, profileId } = await this.entry(id);
    try {
      await saveModelThumbs(entry.abs, image, {
        replace: true,
        trashDir: this.pictureTrash(profileId),
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        400,
        "That file isn't an image Blombo can read. Try a PNG, JPEG or WebP.",
        "bad_image",
      );
    }
    this.changed();
  }

  /** Move the model's picture to the profile's trash (cards show Civitai's or the fallback). */
  async removePicture(id: string): Promise<void> {
    const { entry, profileId } = await this.entry(id);
    const dir = dataDirOf(entry.abs);
    const old = await findThumbs(dir);
    const stamp = `${Date.now().toString(36)}-${path.basename(dir)}`;
    for (const file of [old.thumb, old.raw])
      if (file)
        await movePath(file, path.join(this.pictureTrash(profileId), stamp, path.basename(file)));
    this.changed();
  }

  private pictureTrash(profileId: string): string {
    return path.join(this.deps.profiles.dir(profileId), "trash", "model-pictures");
  }

  private changed(): void {
    this.invalidate();
    this.deps.onChanged();
  }

  /** Rename the model file and its sidecars ("foo.*" → "bar.*", "foo_data" → "bar_data"). */
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
    const list = await this.list();
    const id = toRel(path.relative(entry.root, newAbs));
    const model = list.models.find((m) => m.id === id);
    if (!model)
      throw new HttpError(
        500,
        "The model moved but couldn't be found again. Rescan models.",
        "lost",
      );
    this.deps.onRenamed?.(model.kind, [
      { from: comfyNameOf(entry.model), to: comfyNameOf(model), folder: false },
    ]);
    return model;
  }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

/** The file's SHA256 in its .civitai.info (the entry with its name, else the primary one). */
export function infoHash(info: CivitaiInfo | null, file: string): string | null {
  const files = Array.isArray(info?.files) ? info.files : [];
  const entry =
    files.find((f) => typeof f?.name === "string" && f.name.toLowerCase() === file.toLowerCase()) ??
    files.find((f) => f?.primary === true) ??
    (files.length === 1 ? files[0] : undefined);
  const sha = entry?.hashes?.SHA256;
  return typeof sha === "string" && /^[0-9a-f]{64}$/i.test(sha) ? sha.toUpperCase() : null;
}

/** Civitai model and version ids from a .civitai.info file. */
function civitaiIds(info: CivitaiInfo | null): { modelId: number; versionId: number } | null {
  if (!info || typeof info.modelId !== "number" || typeof info.id !== "number") return null;
  return { modelId: info.modelId, versionId: info.id };
}

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

/** "foo_data" next to foo.safetensors is that model's data folder, not a folder of models. */
function isModelDataDir(name: string, stems: string[]): boolean {
  const low = name.toLowerCase();
  return low.endsWith(DATA_SUFFIX) && stems.includes(low.slice(0, -DATA_SUFFIX.length));
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
  const stems = items
    .filter((e) => e.isFile() && EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => stemOf(e.name).toLowerCase());
  for (const e of items)
    if (e.isDirectory() && !e.name.startsWith(".") && !isModelDataDir(e.name, stems)) {
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
