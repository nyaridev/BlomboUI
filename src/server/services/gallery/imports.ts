/**
 * Adding images to the gallery from outside. A file from your PC (an image, a GIF, an MP4 or
 * audio) is copied into the main output
 * folder's `imported/`; an image from Civitai is downloaded (its original file) into `civitai/`
 * with what Civitai says about it beside it (`<image>.civitai.json`: the prompt and settings as
 * the poster shared them, who posted it, and every model version that made it).
 *
 * Civitai's original files often keep their own metadata, but not always (many are JPEGs
 * without any), and only Civitai's answer names the model versions, which is what links the
 * image to a model or LoRA once you have it. So the sidecar is written every time, before the
 * image (indexing reads it). Nothing is ever replaced: a taken name gets a free one, and the same
 * Civitai image (by the key in its address) or the same file is added once.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { civitaiOriginal } from "../../../shared/civitai.ts";
import {
  type AddCivitaiImageBody,
  type AddedImage,
  CIVITAI_SIDECAR,
  type CivitaiSidecar,
  type GalleryImage,
  IMPORT_FOLDERS,
} from "../../../shared/gallery.ts";
import {
  exists,
  freePath,
  resolveInside,
  writeFileIfAbsent,
  writeJsonAtomic,
} from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";
import { sniffImage } from "../../lib/remote.ts";
import type { CivitaiService } from "../civitai/index.ts";
import { readSidecar } from "./files.ts";
import type { GalleryService } from "./index.ts";

export interface ImportDeps {
  gallery: GalleryService;
  civitai: CivitaiService;
}

/** The types the gallery shows, and the extension each is saved with. */
const EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpeg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/flac": ".flac",
  "audio/ogg": ".ogg",
};
const SAME_TYPE: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
};
const TAKES =
  "The gallery takes PNG, JPEG, WebP and GIF images, MP4 videos and MP3, WAV, FLAC and OGG audio.";

/** A file's type from its first bytes: an image the gallery shows, an MP4, or audio. */
export function sniffMedia(bytes: Uint8Array): string | null {
  const image = sniffImage(bytes);
  if (image && image !== "image/avif") return image;
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(4) === "ftyp" && !image) return "video/mp4";
  if (tag(0) === "fLaC") return "audio/flac";
  if (tag(0) === "RIFF" && tag(8) === "WAVE") return "audio/wav";
  if (tag(0) === "OggS") return "audio/ogg";
  if (tag(0).startsWith("ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0))
    return "audio/mpeg";
  return null;
}

/**
 * A file name that's safe on Windows and has the extension its bytes call for: no folders,
 * no characters Windows refuses, not too long.
 */
export function importName(name: string, type: string): string {
  const ext = EXTENSION[type] ?? "";
  const base = name.split(/[\\/]/).pop() ?? "";
  const own = path.extname(base).toLowerCase();
  const stem = (SAME_TYPE[type]?.includes(own) ? base.slice(0, -own.length) : base)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are refused
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 120);
  const keep = SAME_TYPE[type]?.includes(own) ? own : ext;
  // Windows' reserved device names can't be file names, whatever the extension.
  const safe = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem) ? `${stem}_` : stem;
  return `${safe || "image"}${keep}`;
}

/** The model versions that made a Civitai image: its page's version first, then Civitai's lists. */
export function imageVersions(
  versionId: number,
  raw: { modelVersionIds?: number[]; meta?: Record<string, unknown> | null },
): number[] {
  const ids = new Set<number>([versionId]);
  for (const id of raw.modelVersionIds ?? []) if (Number.isInteger(id) && id > 0) ids.add(id);
  const resources = raw.meta?.civitaiResources;
  if (Array.isArray(resources))
    for (const r of resources as Array<Record<string, unknown>>) {
      const id = r?.modelVersionId;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) ids.add(id);
    }
  return [...ids];
}

export class ImportService {
  private readonly deps: ImportDeps;

  constructor(deps: ImportDeps) {
    this.deps = deps;
  }

  /** Copy an image, video or audio file from your PC into `imported/`. */
  async addFile(bytes: Uint8Array, name: string): Promise<AddedImage> {
    const type = sniffMedia(bytes);
    if (!type || !EXTENSION[type]) throw new HttpError(415, TAKES, "not_image");
    const root = await this.deps.gallery.mainFolder();
    const target = resolveInside(root, `${IMPORT_FOLDERS.imported}/${importName(name, type)}`);
    // The same file added again is the copy that's there.
    if (await sameFile(target, bytes))
      return { image: await this.index(root, target), already: true };
    const dest = await freePath(target);
    if (!(await writeFileIfAbsent(dest, bytes)))
      throw new HttpError(409, "Another file took that name just now. Try again.", "exists");
    return { image: await this.index(root, dest), already: false };
  }

  /** Download a Civitai image's original into `civitai/`, with its sidecar. */
  async addCivitai(body: AddCivitaiImageBody & { id: number | null }): Promise<AddedImage> {
    const root = await this.deps.gallery.mainFolder();
    const folder = resolveInside(root, IMPORT_FOLDERS.civitai);
    for (const ext of Object.values(EXTENSION)) {
      const there = path.join(folder, `${body.key}${ext}`);
      if (!(await exists(there))) continue;
      // Added before sidecars kept model names: adding it again fills them in.
      const sidecar = await readSidecar(there);
      if (sidecar?.versions.length && !Object.keys(sidecar.names).length) {
        const names = await this.versionNames(sidecar.versions);
        if (Object.keys(names).length)
          await writeJsonAtomic(`${there}${CIVITAI_SIDECAR}`, { ...sidecar, names });
      }
      return { image: await this.index(root, there), already: true };
    }
    const { civitai } = this.deps;
    const raw = await civitai.imageToAdd(body);
    const url = civitaiOriginal(raw.url as string);
    const { bytes, type } = await civitai.images.original(url);
    const ext = EXTENSION[type];
    if (!ext) throw new HttpError(415, TAKES, "not_image");
    const file = path.join(folder, `${body.key}${ext}`);
    const versions = imageVersions(body.versionId, raw);
    const sidecar: CivitaiSidecar = {
      format: "blombo.civitai-image/1",
      imageId: typeof raw.id === "number" ? raw.id : body.id,
      key: body.key,
      url,
      site: civitai.site,
      postId: typeof raw.postId === "number" ? raw.postId : null,
      by: typeof raw.username === "string" && raw.username ? raw.username : null,
      versionId: body.versionId,
      versions,
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : null,
      names: await this.versionNames(versions),
      addedAt: Date.now(),
    };
    // First, so indexing the image finds it.
    await writeJsonAtomic(`${file}${CIVITAI_SIDECAR}`, sidecar);
    const wrote = await writeFileIfAbsent(file, bytes);
    return { image: await this.index(root, file), already: !wrote };
  }

  /** Each version's model name, as Civitai has it (cached answers; one it can't give is left out). */
  private async versionNames(ids: number[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(
      ids.map((id) =>
        this.deps.civitai.rawVersion(id).then(
          (v) => {
            if (v.model?.name) out[String(id)] = v.model.name;
          },
          () => undefined,
        ),
      ),
    );
    return out;
  }

  private async index(root: string, file: string): Promise<GalleryImage> {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const image = await this.deps.gallery.ingest(rel);
    if (!image)
      throw new HttpError(
        500,
        "The image was saved but couldn't be read back. Rescan the gallery.",
        "unreadable",
      );
    return image;
  }
}

/** Whether `file` exists with exactly these bytes. */
async function sameFile(file: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    if (stat.size !== bytes.byteLength) return false;
    return Buffer.from(await fs.readFile(file)).equals(bytes);
  } catch {
    return false;
  }
}
