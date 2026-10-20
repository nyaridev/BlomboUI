/**
 * Profiles service (ADR-0006). Owns data/profiles.json and data/profiles/<id>/profile.json.
 * The active profile is in-memory state: opening a profile is a hot switch, not a restart.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  type CreateProfileBody,
  Profile,
  ProfileRegistry,
  ProfileSecrets,
  slugifyProfileName,
  type UpdateProfileBody,
} from "../../shared/profile.ts";
import type { ServerConfig } from "../config.ts";
import { Emitter } from "../lib/emitter.ts";
import { exists, movePath, readJsonFile, writeFileAtomic, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";

const AVATAR_SIZE = 256;

type ProfileEvents = {
  /** A profile was opened (also when the same one is opened again, e.g. after a reload). */
  opened: (profile: Profile, previousId: string | null) => void;
  /** A profile's settings changed. */
  updated: (profile: Profile) => void;
};

export class ProfileService extends Emitter<ProfileEvents> {
  private readonly config: ServerConfig;
  private activeId: string | null = null;
  /**
   * Called before a profile's folder moves to the trash, to stop what still uses it (its open
   * database, the queue, a sync). Set in context.ts.
   */
  beforeRemove: ((id: string) => Promise<void>) | null = null;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
  }

  private get registryFile() {
    return path.join(this.config.dataDir, "profiles.json");
  }

  dir(id: string) {
    return path.join(this.config.dataDir, "profiles", id);
  }

  private profileFile(id: string) {
    return path.join(this.dir(id), "profile.json");
  }

  private secretsFile(id: string) {
    return path.join(this.dir(id), "secrets.json");
  }

  /** The profile's secrets (server only; never return them from a route). */
  async secrets(id: string): Promise<ProfileSecrets> {
    try {
      return await readJsonFile(this.secretsFile(id), ProfileSecrets, {});
    } catch (error) {
      console.warn(`secrets.json of "${id}" couldn't be read; treating it as empty.`, error);
      return ProfileSecrets.parse({});
    }
  }

  async updateSecrets(
    id: string,
    patch: { civitai?: Partial<ProfileSecrets["civitai"]> },
  ): Promise<ProfileSecrets> {
    await this.get(id);
    let current: ProfileSecrets;
    try {
      current = await readJsonFile(this.secretsFile(id), ProfileSecrets, {});
    } catch {
      // Never write over a file we couldn't read: it may hold a key the user still wants.
      throw new HttpError(
        409,
        "The profile's secrets.json can't be read. Fix or delete it in the profile folder, then try again.",
        "secrets_unreadable",
      );
    }
    const next = ProfileSecrets.parse({
      ...current,
      civitai: { ...current.civitai, ...patch.civitai },
    });
    await writeJsonAtomic(this.secretsFile(id), next);
    return next;
  }

  avatarFile(id: string) {
    return path.join(this.dir(id), "avatar.webp");
  }

  get active(): string | null {
    return this.activeId;
  }

  async registry(): Promise<ProfileRegistry> {
    return readJsonFile(this.registryFile, ProfileRegistry, {});
  }

  async list(): Promise<Profile[]> {
    const reg = await this.registry();
    const out: Profile[] = [];
    for (const id of reg.order) {
      const profile = await this.find(id);
      if (profile) out.push(profile);
    }
    return out;
  }

  async find(id: string): Promise<Profile | null> {
    if (!(await exists(this.profileFile(id)))) return null;
    return Profile.parse(JSON.parse(await fs.readFile(this.profileFile(id), "utf8")));
  }

  async get(id: string): Promise<Profile> {
    const profile = await this.find(id);
    if (!profile) throw new HttpError(404, `Profile "${id}" was not found.`, "profile_missing");
    return profile;
  }

  async create(body: CreateProfileBody): Promise<Profile> {
    const reg = await this.registry();
    const base = slugifyProfileName(body.name);
    let id = base;
    for (let n = 2; reg.order.includes(id) || (await exists(this.dir(id))); n++)
      id = `${base}-${n}`;

    const profile = Profile.parse({
      id,
      name: body.name,
      accent: body.accent,
      theme: body.theme,
      paths: body.paths,
      comfy: body.comfy,
      createdAt: new Date().toISOString(),
    });
    await fs.mkdir(path.join(this.dir(id), "workflows"), { recursive: true });
    await fs.mkdir(path.join(this.dir(id), "layouts"), { recursive: true });
    await writeJsonAtomic(this.profileFile(id), profile);
    await writeJsonAtomic(this.registryFile, { ...reg, order: [...reg.order, id] });
    return profile;
  }

  /** A free profile id for a name ("My renders" → "my-renders", "my-renders-2"…). */
  async freeId(name: string): Promise<string> {
    const reg = await this.registry();
    const base = slugifyProfileName(name);
    let id = base;
    for (let n = 2; reg.order.includes(id) || (await exists(this.dir(id))); n++)
      id = `${base}-${n}`;
    return id;
  }

  /** List a profile whose folder was just written (an imported export). */
  async adopt(profile: Profile): Promise<Profile> {
    const parsed = Profile.parse(profile);
    await writeJsonAtomic(this.profileFile(parsed.id), parsed);
    const reg = await this.registry();
    if (!reg.order.includes(parsed.id))
      await writeJsonAtomic(this.registryFile, { ...reg, order: [...reg.order, parsed.id] });
    return parsed;
  }

  async update(id: string, patch: UpdateProfileBody): Promise<Profile> {
    const current = await this.get(id);
    const next = Profile.parse({
      ...current,
      ...patch,
      paths: { ...current.paths, ...patch.paths },
    });
    await writeJsonAtomic(this.profileFile(id), next);
    this.emit("updated", next);
    return next;
  }

  async setAvatar(id: string, image: Uint8Array): Promise<Profile> {
    await this.get(id);
    let webp: Buffer;
    try {
      webp = await sharp(Buffer.from(image))
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
        .webp({ quality: 88 })
        .toBuffer();
    } catch {
      throw new HttpError(400, "That file isn't an image we can read.", "bad_image");
    }
    await writeFileAtomic(this.avatarFile(id), webp);
    return this.setHasAvatar(id, true);
  }

  async removeAvatar(id: string): Promise<Profile> {
    await fs.rm(this.avatarFile(id), { force: true });
    return this.setHasAvatar(id, false);
  }

  private async setHasAvatar(id: string, hasAvatar: boolean): Promise<Profile> {
    const next = { ...(await this.get(id)), hasAvatar };
    await writeJsonAtomic(this.profileFile(id), next);
    return next;
  }

  /** Hot switch. Returns whether ComfyUI needs a restart (models root changed). */
  async open(id: string): Promise<{ profile: Profile; comfyRestart: boolean }> {
    const previous = this.activeId ? await this.find(this.activeId) : null;
    const profile = await this.get(id);
    const opened = { ...profile, lastOpenedAt: new Date().toISOString() };
    await writeJsonAtomic(this.profileFile(id), opened);
    this.activeId = id;
    const comfyRestart = previous !== null && previous.paths.models !== profile.paths.models;
    this.emit("opened", opened, previous?.id ?? null);
    return { profile: opened, comfyRestart };
  }

  close() {
    this.activeId = null;
  }

  async reorder(order: string[]): Promise<ProfileRegistry> {
    const reg = await this.registry();
    const known = new Set(reg.order);
    const next = [...order.filter((id) => known.has(id))];
    for (const id of reg.order) if (!next.includes(id)) next.push(id);
    const updated = { ...reg, order: next };
    await writeJsonAtomic(this.registryFile, updated);
    return updated;
  }

  async setOpenOnLaunch(id: string | null): Promise<ProfileRegistry> {
    const reg = await this.registry();
    const updated = { ...reg, openOnLaunch: id };
    await writeJsonAtomic(this.registryFile, updated);
    return updated;
  }

  /** Moves the profile folder into data/trash/ so it can be restored by hand. */
  async remove(id: string): Promise<void> {
    await this.get(id);
    const reg = await this.registry();
    const trash = path.join(this.config.dataDir, "trash", `${id}-${Date.now()}`);
    await this.beforeRemove?.(id);
    if (this.activeId === id) this.activeId = null;
    try {
      await movePath(this.dir(id), trash);
    } catch (error) {
      throw new HttpError(
        409,
        `Couldn't move the profile to the trash: ${error instanceof Error ? error.message : error}. Close any app that has a file in its folder open and try again.`,
        "remove_failed",
      );
    }
    await writeJsonAtomic(this.registryFile, {
      ...reg,
      order: reg.order.filter((item) => item !== id),
      openOnLaunch: reg.openOnLaunch === id ? null : reg.openOnLaunch,
    });
    if (this.activeId === id) this.activeId = null;
  }
}
