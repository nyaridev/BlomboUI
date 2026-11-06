/**
 * Settings → Leftovers (shared/leftovers.ts): finds what Blombo keeps for models and wildcards
 * that are gone, and clears it on request. Clearing scans again and acts only on what that scan
 * still finds with the ids asked for, so a request can't point at any other file. Files move to
 * the profile's trash (trash/leftovers/<time>/<folder>/…, the folders below the models folder
 * kept so a file can be put back); favorites are forgotten.
 *
 * Model info is judged per folder: a sidecar ("foo.civitai.info", "foo.preview.png", "foo.json"
 * with A1111 info, "foo_data/" with pictures) is a leftover when no model file in that folder has
 * the stem "foo". Other .json files (a model's config.json) are left alone.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ModelKind } from "../../shared/constants.ts";
import type { ClearedLeftovers, Leftover, LeftoverReport } from "../../shared/leftovers.ts";
import { comfyNameOf, MODEL_EXTENSIONS } from "../../shared/models.ts";
import { movePath } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { HistoryService } from "./history.ts";
import type { ModelService } from "./models.ts";
import { findPictures } from "./modelthumbs.ts";
import type { ProfileService } from "./profiles.ts";
import type { WildcardPictures } from "./wildcardpics.ts";
import { listWildcards } from "./wildcards.ts";

export interface LeftoverDeps {
  profiles: ProfileService;
  models: Pick<ModelService, "list">;
  history: Pick<HistoryService, "allMarks" | "removeMarks">;
  pictures: WildcardPictures;
}

/** What a scan found, with what clearing each item does (kept on the server). */
interface Found extends Leftover {
  files: string[];
  /** Where each file goes inside the trash folder (models only). */
  trashAs?: string[];
  mark?: { kind: string; name: string };
}

const MODEL_EXTS = new Set<string>(MODEL_EXTENSIONS);
const A1111_KEYS = ["activation text", "preferred weight", "sd version", "notes", "description"];
const PREVIEW = /\.preview\.(png|jpe?g|webp|gif|mp4)$/i;
const DATA = /_data$/i;
const norm = (p: string) => p.replace(/\\/g, "/");

async function isDir(p: string): Promise<boolean> {
  return (await fs.stat(p).catch(() => null))?.isDirectory() ?? false;
}

async function sizeOf(p: string): Promise<number> {
  const stat = await fs.stat(p).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const name of await fs.readdir(p).catch(() => [] as string[]))
    total += await sizeOf(path.join(p, name));
  return total;
}

async function isA1111(file: string): Promise<boolean> {
  try {
    const json = JSON.parse((await fs.readFile(file, "utf8")).replace(/^﻿/, ""));
    return Boolean(json) && typeof json === "object" && A1111_KEYS.some((k) => k in json);
  } catch {
    return false;
  }
}

export class LeftoverService {
  private readonly deps: LeftoverDeps;

  constructor(deps: LeftoverDeps) {
    this.deps = deps;
  }

  async scan(): Promise<LeftoverReport> {
    const { items, skipped } = await this.find();
    return {
      items: items.map(({ files: _f, mark: _m, ...item }) => item),
      skipped,
      scannedAt: Date.now(),
    };
  }

  async clear(ids: string[]): Promise<ClearedLeftovers> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const wanted = new Set(ids);
    const { items } = await this.find();
    const trash = path.join(
      this.deps.profiles.dir(profileId),
      "trash",
      "leftovers",
      Date.now().toString(36),
    );
    let moved = 0;
    const marks: Array<{ kind: string; name: string }> = [];
    for (const item of items.filter((i) => wanted.has(i.id))) {
      if (item.mark) marks.push(item.mark);
      if (item.kind === "wildcard-picture") {
        await this.deps.pictures.trashFiles(item.files, profileId);
        moved += item.files.length;
        continue;
      }
      for (const [i, file] of item.files.entries()) {
        await movePath(
          file,
          path.join(trash, ...(item.trashAs?.[i] ?? path.basename(file)).split("/")),
        );
        moved++;
      }
    }
    if (marks.length) this.deps.history.removeMarks(marks);
    return { moved, forgotten: marks.length };
  }

  private async find(): Promise<{ items: Found[]; skipped: string[] }> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    const profile = await this.deps.profiles.get(profileId);
    const items: Found[] = [];
    const skipped: string[] = [];

    // Models: sidecars without their model, folder by folder.
    let modelsHere = true;
    for (const folder of profile.folders.models) {
      if (!(await isDir(folder.path))) {
        skipped.push(folder.path);
        modelsHere = false;
        continue;
      }
      // The folder's id keeps two models folders with the same name apart in the trash.
      const label = `${folder.id}-${path.basename(folder.path)}`;
      await this.scanModels(folder.path, folder.path, label, items, 0);
    }

    // Wildcards: pictures and favorites whose name no folder defines.
    let wildcardsHere = profile.folders.wildcards.length > 0;
    for (const folder of profile.folders.wildcards)
      if (!(await isDir(folder.path))) {
        skipped.push(folder.path);
        wildcardsHere = false;
      }
    const names = wildcardsHere
      ? new Set(await listWildcards(profile.folders.wildcards.map((f) => f.path)))
      : null;
    if (names)
      for (const p of await this.deps.pictures.all(profileId))
        if (!names.has(p.name))
          items.push({
            id: `wildcard-picture:${p.name}`,
            kind: "wildcard-picture",
            name: p.name,
            detail: "Picture",
            size: await sizeOf(p.file),
            files: [p.file],
          });

    // Favorites: hearts on models or wildcards that aren't there.
    const list = modelsHere && profile.folders.models.length ? await this.deps.models.list() : null;
    const byKind = new Map<string, Set<string>>();
    for (const m of list?.models ?? []) {
      const set = byKind.get(m.kind) ?? new Set<string>();
      set.add(norm(comfyNameOf(m)).toLowerCase());
      byKind.set(m.kind, set);
    }
    for (const mark of this.deps.history.allMarks()) {
      const isWildcard = mark.kind === "wildcards";
      if (isWildcard ? !names : !list) continue;
      const known = isWildcard
        ? names?.has(mark.name)
        : byKind.get(mark.kind as ModelKind)?.has(norm(mark.name).toLowerCase());
      if (known) continue;
      items.push({
        id: `favorite:${mark.kind}:${mark.name}`,
        kind: "favorite",
        name: isWildcard ? mark.name : norm(mark.name),
        detail: isWildcard ? "Wildcard" : mark.kind,
        size: 0,
        files: [],
        mark,
      });
    }
    return { items, skipped };
  }

  private async scanModels(
    root: string,
    dir: string,
    label: string,
    out: Found[],
    depth: number,
  ): Promise<void> {
    if (depth > 12) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const stems = new Set(
      entries
        .filter((e) => e.isFile() && MODEL_EXTS.has(path.extname(e.name).toLowerCase()))
        .map((e) => e.name.slice(0, -path.extname(e.name).length).toLowerCase()),
    );
    // stem → its leftover files in this folder.
    const orphans = new Map<string, { name: string; files: string[]; parts: Set<string> }>();
    const add = (stem: string, file: string, part: string) => {
      const key = stem.toLowerCase();
      if (stems.has(key)) return;
      const o = orphans.get(key) ?? { name: stem, files: [], parts: new Set<string>() };
      o.files.push(file);
      o.parts.add(part);
      orphans.set(key, o);
    };
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      const lower = e.name.toLowerCase();
      if (e.isDirectory()) {
        if (DATA.test(e.name)) {
          const pics = await findPictures(full);
          if (pics.size) add(e.name.slice(0, -"_data".length), full, "pictures");
          continue; // A data folder holds pictures, not models.
        }
        await this.scanModels(root, full, label, out, depth + 1);
      } else if (e.isFile()) {
        if (lower.endsWith(".civitai.info")) add(e.name.slice(0, -13), full, "Civitai info");
        else if (PREVIEW.test(e.name)) add(e.name.replace(PREVIEW, ""), full, "preview");
        else if (lower.endsWith(".json") && (await isA1111(full)))
          add(e.name.slice(0, -5), full, "info");
      }
    }
    const where = norm(path.relative(root, dir)) || ".";
    for (const o of orphans.values()) {
      let size = 0;
      for (const f of o.files) size += await sizeOf(f);
      out.push({
        id: `model:${norm(path.join(dir, o.name)).toLowerCase()}`,
        kind: "model",
        name: o.name,
        detail: `${norm(path.join(path.basename(root), where === "." ? "" : where))} · ${[...o.parts].join(", ")}`,
        size,
        files: o.files,
        trashAs: o.files.map((f) => `${label}/${norm(path.relative(root, f))}`),
      });
    }
  }
}
