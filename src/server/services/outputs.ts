/**
 * What happens to a run's images in the main output folder (Settings → Saving):
 *
 *   - ComfyUI saves where `prefix()` says (the images pattern, shared/savepaths.ts).
 *   - Right after, `process()` converts a PNG to JPEG or WebP when that's the format (keeping
 *     the generation data, lib/saveformat.ts), and writes a JPEG copy of a large image where the
 *     JPEG copies pattern says.
 *   - A stopped run's images move where the interrupted pattern says (`interruptedPath`), and
 *     grids are saved where the grids pattern says (`gridTarget`).
 *
 * An image outside the main output folder (a ComfyUI that saves elsewhere) is left as it is.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { JobImage } from "../../shared/jobs.ts";
import { mainFolder } from "../../shared/profile.ts";
import { comfyPrefix, nextNumber, type PathVars, resolvePattern } from "../../shared/savepaths.ts";
import type { ImageFormat, SavingSettings } from "../../shared/settings.ts";
import { freePath, resolveInside, writeFileIfAbsent } from "../lib/fsx.ts";
import { readImageHeadBytes } from "../lib/imagemeta.ts";
import { EXTENSIONS, encodeImage } from "../lib/saveformat.ts";
import type { ProfileService } from "./profiles.ts";
import type { SettingsService } from "./settings.ts";

export interface OutputDeps {
  profiles: Pick<ProfileService, "find" | "dir">;
  settings: Pick<SettingsService, "get">;
  /** Index a file Blombo wrote into the main output folder (the gallery). */
  ingest?: (ref: { filename: string; subfolder: string; type: "output" }) => Promise<unknown>;
}

const toSlash = (p: string) => p.replace(/\\/g, "/");
const stemOf = (name: string) => name.slice(0, name.length - path.extname(name).length);

export class OutputSaver {
  private readonly deps: OutputDeps;

  constructor(deps: OutputDeps) {
    this.deps = deps;
  }

  async saving(profileId: string): Promise<SavingSettings> {
    return (await this.deps.settings.get(profileId)).saving;
  }

  /** The profile's main output folder, or "" without one. */
  private async outputs(profileId: string): Promise<string> {
    const profile = await this.deps.profiles.find(profileId);
    return profile ? mainFolder(profile, "outputs").trim() : "";
  }

  /** ComfyUI's `filename_prefix` for a run's images. */
  async prefix(profileId: string, vars: PathVars): Promise<string> {
    return comfyPrefix((await this.saving(profileId)).paths.images, vars);
  }

  /**
   * After ComfyUI saved an image: convert it and write a JPEG copy when the settings say so.
   * Returns the image as the job should know it (a converted one has its new name).
   */
  async process(profileId: string, vars: PathVars, image: JobImage): Promise<JobImage> {
    if (image.type !== "output") return image;
    const out = await this.outputs(profileId);
    if (!out) return image;
    let file: string;
    try {
      file = resolveInside(out, [image.subfolder, image.filename].filter(Boolean).join("/"));
    } catch {
      return image;
    }
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) return image;
    const saving = await this.saving(profileId);
    const isPng = path.extname(file).toLowerCase() === ".png";
    const convert = saving.format !== "png" && isPng;
    const copy = saving.jpegCopy;
    const wantsCopy = copy.enabled && saving.format !== "jpeg";
    if (!convert && !(wantsCopy && stat.size > copy.overKb * 1024)) return image;

    const bytes = await fs.readFile(file);
    const text = (await readImageHeadBytes(bytes)).text;
    let current = image;
    let size = stat.size;
    if (convert) {
      const data = await encodeImage(bytes, saving.format, saving.quality, text);
      const target = `${file.slice(0, -4)}${EXTENSIONS[saving.format]}`;
      if (await writeFileIfAbsent(target, data)) {
        // ComfyUI can only save PNGs: that file was the way in, and the converted one replaces it.
        await fs.unlink(file).catch(() => undefined);
        current = { ...image, filename: path.basename(target) };
        size = data.length;
      }
    }
    if (wantsCopy && size > copy.overKb * 1024)
      await this.jpegCopy(out, saving, vars, stemOf(image.filename), bytes, text);
    return current;
  }

  private async jpegCopy(
    out: string,
    saving: SavingSettings,
    vars: PathVars,
    name: string,
    bytes: Buffer,
    text: Record<string, string>,
  ): Promise<void> {
    const rel = `${resolvePattern(saving.paths.jpegCopies, { ...vars, name })}.jpg`;
    const dest = await freePath(resolveInside(out, rel));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await writeFileIfAbsent(dest, await encodeImage(bytes, "jpeg", saving.jpegCopy.quality, text));
    void this.deps
      .ingest?.({
        filename: path.basename(dest),
        subfolder: toSlash(path.relative(out, path.dirname(dest))),
        type: "output",
      })
      .catch(() => undefined);
  }

  /** Where a stopped run's image moves, inside the main output folder (its extension kept). */
  async interruptedPath(
    profileId: string,
    vars: PathVars,
    ref: { filename: string },
  ): Promise<string> {
    const pattern = (await this.saving(profileId)).paths.interrupted;
    return `${resolvePattern(pattern, { ...vars, name: stemOf(ref.filename) })}${path.extname(ref.filename)}`;
  }

  /**
   * Where a grid goes: the grids pattern inside the main output folder (`subfolder` set, so the
   * gallery can index it), or the profile's grids/ folder without one.
   */
  async gridTarget(
    profileId: string,
    vars: PathVars,
    format: ImageFormat,
  ): Promise<{ file: string; subfolder: string | null }> {
    const out = await this.outputs(profileId);
    const pattern = (await this.saving(profileId)).paths.grids;
    const rel = resolvePattern(pattern.replace(/\[number\]/g, "\u0000"), vars);
    const root = out || path.join(this.deps.profiles.dir(profileId), "grids");
    const dir = path.dirname(resolveInside(root, rel.replaceAll("\u0000", "0")));
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const fileName = pattern.includes("[number]")
      ? path
          .basename(rel)
          .replaceAll("\u0000", nextNumber(pattern.split("/").at(-1) ?? "", vars, names))
      : path.basename(rel);
    const file = await freePath(path.join(dir, `${fileName}${EXTENSIONS[format]}`));
    return { file, subfolder: out ? toSlash(path.relative(out, dir)) : null };
  }
}
