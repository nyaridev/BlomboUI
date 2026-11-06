/**
 * Wildcard pictures: a picture you pick for a wildcard, shown on its card. Wildcards are names
 * (a .txt file or a YAML key), not files of their own, so the pictures live in the profile:
 *
 *   data/profiles/<id>/wildcard-pictures/outfits%2Ffantasy.jpg    (fits in 576 px)
 *
 * one flat file per name (the name URL-encoded), so a folder rename never drags the picture of
 * a wildcard that happens to share the folder's name. Renames carry them along (`rename`); a
 * replaced or removed picture moves to the profile's trash. Pictures whose wildcard is gone show
 * on Settings → Leftovers.
 * shortcut: only the card-sized picture is kept, no full-size original; keep one if a large view
 * of wildcard pictures is ever wanted.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { RenameChange } from "../../shared/prompt/renames.ts";
import { exists, movePath, writeFileAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import type { ProfileService } from "./profiles.ts";

sharp.cache(false);

const SIZE = 576;
const EXT = ".jpg";

export const pictureFile = (name: string) => `${encodeURIComponent(name)}${EXT}`;
export const pictureName = (file: string) => decodeURIComponent(file.slice(0, -EXT.length));

export class WildcardPictures {
  private readonly profiles: ProfileService;

  constructor(profiles: ProfileService) {
    this.profiles = profiles;
  }

  private profileId(): string {
    const id = this.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  dir(profileId = this.profileId()): string {
    return path.join(this.profiles.dir(profileId), "wildcard-pictures");
  }

  private trash(profileId: string): string {
    return path.join(
      this.profiles.dir(profileId),
      "trash",
      "wildcard-pictures",
      Date.now().toString(36),
    );
  }

  /** Every picture's wildcard name and file. */
  async all(profileId = this.profileId()): Promise<Array<{ name: string; file: string }>> {
    let files: string[] = [];
    try {
      files = await fs.readdir(this.dir(profileId));
    } catch {
      return [];
    }
    return files
      .filter((f) => f.endsWith(EXT))
      .flatMap((f) => {
        try {
          return [{ name: pictureName(f), file: path.join(this.dir(profileId), f) }];
        } catch {
          return []; // Not a name Blombo encoded.
        }
      });
  }

  /** name → the card's picture URL (versioned by the file's time). */
  async urls(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const p of await this.all()) {
      const stat = await fs.stat(p.file).catch(() => null);
      if (stat)
        out[p.name] =
          `/api/wildcards/picture?name=${encodeURIComponent(p.name)}&v=${Math.round(stat.mtimeMs)}`;
    }
    return out;
  }

  async file(name: string): Promise<string> {
    const file = path.join(this.dir(), pictureFile(name));
    if (!(await exists(file))) throw new HttpError(404, "That wildcard has no picture.", "none");
    return file;
  }

  /** Make an image the wildcard's picture; an old one moves to the trash. */
  async set(name: string, image: Uint8Array): Promise<void> {
    const profileId = this.profileId();
    let jpg: Buffer;
    try {
      jpg = await sharp(Buffer.from(image), { failOn: "none" })
        .rotate()
        .resize({ width: SIZE, height: SIZE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new HttpError(
        400,
        "That file isn't an image Blombo can read. Try a PNG, JPEG or WebP.",
        "bad_image",
      );
    }
    await this.remove(name, profileId);
    await writeFileAtomic(path.join(this.dir(profileId), pictureFile(name)), jpg);
  }

  /** Move the wildcard's picture to the trash (nothing happens when it has none). */
  async remove(name: string, profileId = this.profileId()): Promise<void> {
    const file = path.join(this.dir(profileId), pictureFile(name));
    if (await exists(file))
      await movePath(file, path.join(this.trash(profileId), pictureFile(name)));
  }

  /** Move pictures (by file) to the trash: Settings → Leftovers. */
  async trashFiles(files: string[], profileId = this.profileId()): Promise<void> {
    const to = this.trash(profileId);
    for (const file of files) await movePath(file, path.join(to, path.basename(file)));
  }

  /**
   * Wildcards were renamed: their pictures follow (a folder's: every name inside it). A picture
   * already at the new name stays, and the old one goes to the trash.
   */
  async rename(changes: RenameChange[], profileId = this.profileId()): Promise<void> {
    const pictures = await this.all(profileId);
    for (const c of changes) {
      if (c.kind !== "wildcard") continue;
      for (const p of pictures) {
        const to =
          p.name === c.from && !c.folder
            ? c.to
            : c.folder && p.name.startsWith(`${c.from}/`)
              ? c.to + p.name.slice(c.from.length)
              : null;
        if (!to || to === p.name) continue;
        const dest = path.join(this.dir(profileId), pictureFile(to));
        if (await exists(dest)) await this.trashFiles([p.file], profileId);
        else await movePath(p.file, dest);
        p.name = to;
        p.file = dest;
      }
    }
  }
}
