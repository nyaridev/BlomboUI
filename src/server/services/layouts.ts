/**
 * Generate layouts (ADR-0005). Built-in layouts ship in presets/layouts/<id>.json; the profile's
 * own are data/profiles/<id>/layouts/<layoutId>.json. A workflow links one by id
 * (manifest.layout); without a link, or when the linked one is gone, it shows the profile's
 * default (settings.generate.layout), and failing that the built-in "default".
 *
 * Deleting moves the file to the profile's trash; workflows that linked it fall back quietly.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  type CreateLayoutBody,
  LayoutDocument,
  LayoutId,
  type LayoutList,
} from "../../shared/layout/schema.ts";
import { slugId } from "../../shared/settings.ts";
import { exists, movePath, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";
import type { SettingsService } from "./settings.ts";

export const BUILTIN_DEFAULT = "default";

async function readDoc(file: string): Promise<LayoutDocument | null> {
  try {
    return LayoutDocument.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

async function readDir(dir: string): Promise<LayoutDocument[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const docs = await Promise.all(names.map((n) => readDoc(path.join(dir, n))));
  return docs
    .filter((d): d is LayoutDocument => d !== null)
    .sort((a, b) =>
      a.id === BUILTIN_DEFAULT ? -1 : b.id === BUILTIN_DEFAULT ? 1 : a.name.localeCompare(b.name),
    );
}

export class LayoutService {
  private readonly presetsDir: string;
  private readonly profiles: ProfileService;
  private readonly settings: SettingsService;
  private builtinCache: Promise<LayoutDocument[]> | null = null;

  constructor(opts: { presetsDir: string; profiles: ProfileService; settings: SettingsService }) {
    this.presetsDir = opts.presetsDir;
    this.profiles = opts.profiles;
    this.settings = opts.settings;
  }

  private profileId(): string {
    const id = this.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  private dir(profileId = this.profileId()): string {
    return path.join(this.profiles.dir(profileId), "layouts");
  }

  private file(id: string, profileId?: string): string {
    if (!LayoutId.safeParse(id).success) throw new HttpError(400, "Invalid layout id.", "bad_id");
    return path.join(this.dir(profileId), `${id}.json`);
  }

  builtins(): Promise<LayoutDocument[]> {
    this.builtinCache ??= readDir(path.join(this.presetsDir, "layouts"));
    return this.builtinCache;
  }

  async list(): Promise<LayoutList> {
    const profileId = this.profileId();
    const [builtins, custom, settings] = await Promise.all([
      this.builtins(),
      readDir(this.dir(profileId)),
      this.settings.get(profileId),
    ]);
    return { builtins, custom, defaultId: settings.generate.layout };
  }

  /** A layout by id (built-in or the profile's), or null. */
  async find(id: string): Promise<LayoutDocument | null> {
    const builtin = (await this.builtins()).find((l) => l.id === id);
    if (builtin) return builtin;
    if (!LayoutId.safeParse(id).success) return null;
    return readDoc(this.file(id));
  }

  /** What a workflow shows: its linked layout, else the profile's default, else "default". */
  async resolve(
    linked: string | null,
  ): Promise<{ doc: LayoutDocument; source: "linked" | "default" }> {
    if (linked) {
      const doc = await this.find(linked);
      if (doc) return { doc, source: "linked" };
    }
    const settings = await this.settings.get(this.profileId());
    const doc =
      (await this.find(settings.generate.layout)) ??
      (await this.find(BUILTIN_DEFAULT)) ??
      (await this.builtins())[0];
    if (!doc)
      throw new HttpError(
        500,
        "BlomboUI's built-in layouts are missing. Reinstall its presets folder.",
        "no_layouts",
      );
    return { doc, source: "default" };
  }

  private async freeId(name: string): Promise<string> {
    const builtinIds = new Set((await this.builtins()).map((l) => l.id));
    const base = slugId(name, "layout");
    let id = base;
    for (let n = 2; builtinIds.has(id) || (await exists(this.file(id))); n++) id = `${base}-${n}`;
    return id;
  }

  async create(body: CreateLayoutBody): Promise<LayoutDocument> {
    const id = await this.freeId(body.name);
    const doc = LayoutDocument.parse({ ...body.doc, id, name: body.name });
    await writeJsonAtomic(this.file(id), doc);
    return doc;
  }

  /**
   * A layout that came with an imported workflow: the same one already here is reused,
   * otherwise it's added (renamed when the name is taken). Returns the id to link.
   */
  async adopt(doc: LayoutDocument): Promise<string> {
    const same = (a: LayoutDocument, b: LayoutDocument) =>
      JSON.stringify([a.regions, a.sizes]) === JSON.stringify([b.regions, b.sizes]);
    if ((await this.builtins()).some((l) => l.id === doc.id)) return doc.id;
    const custom = await readDir(this.dir());
    const match = custom.find((l) => l.id === doc.id && same(l, doc));
    if (match) return match.id;
    const names = new Set(custom.map((l) => l.name.toLowerCase()));
    let name = doc.name;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${doc.name.slice(0, 50)} (${n})`;
    return (await this.create({ name, doc })).id;
  }

  async save(id: string, input: LayoutDocument): Promise<LayoutDocument> {
    if ((await this.builtins()).some((l) => l.id === id))
      throw new HttpError(
        400,
        "Built-in layouts can't be changed. Save it as a new layout.",
        "builtin",
      );
    const file = this.file(id);
    const current = await readDoc(file);
    if (!current)
      throw new HttpError(
        404,
        "That layout was not found. Save it as a new one.",
        "layout_missing",
      );
    const doc = LayoutDocument.parse({ ...input, id, name: current.name });
    await writeJsonAtomic(file, doc);
    return doc;
  }

  async rename(id: string, name: string): Promise<LayoutDocument> {
    const file = this.file(id);
    const current = await readDoc(file);
    if (!current) throw new HttpError(404, "That layout was not found.", "layout_missing");
    const doc = { ...current, name };
    await writeJsonAtomic(file, doc);
    return doc;
  }

  /** Move to data/profiles/<id>/trash/layouts/. */
  async remove(id: string): Promise<void> {
    const file = this.file(id);
    if (!(await exists(file)))
      throw new HttpError(404, "That layout was not found.", "layout_missing");
    const profileId = this.profileId();
    const trash = path.join(
      this.profiles.dir(profileId),
      "trash",
      "layouts",
      `${id}-${Date.now()}.json`,
    );
    await fs.mkdir(path.dirname(trash), { recursive: true });
    await movePath(file, trash);
  }
}
