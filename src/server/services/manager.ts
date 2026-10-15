/**
 * The ComfyUI model catalog behind Models → Manager: ComfyUI-Manager's model-list.json, fetched
 * once a day into runtime/cache/manager/ (the cached copy is used when the network is down),
 * mapped to store entries with their folder, size and whether the file is already in the
 * profile's models folder. Installing is a download (services/downloads.ts).
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseSize } from "../../shared/downloads.ts";
import {
  type Catalog,
  type CatalogEntry,
  catalogFolder,
  kindOfFolder,
  storeCategory,
} from "../../shared/manager.ts";
import { exists, resolveInside, writeJsonAtomic } from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { fetchFollow, readLimited } from "../lib/remote.ts";
import { comfyFolderKeys } from "./comfy/paths.ts";
import type { ProfileService } from "./profiles.ts";

const DAY_MS = 24 * 3600_000;
const MAX_BYTES = 8 * 1024 * 1024;

interface RawEntry {
  name?: unknown;
  type?: unknown;
  base?: unknown;
  save_path?: unknown;
  description?: unknown;
  reference?: unknown;
  filename?: unknown;
  url?: unknown;
  size?: unknown;
}

/** An entry with what the download needs (the URL stays on the server side of the API). */
export interface InstallableEntry extends CatalogEntry {
  url: string;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function sameOrigin(url: string, origin: string | null): boolean {
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function safeName(name: string): boolean {
  return Boolean(name) && !/[\\/:*?"<>|]/.test(name) && name !== "." && name !== "..";
}

/** Catalog JSON → entries (bad or unplaceable rows are skipped or marked). Pure. */
export function parseCatalog(
  raw: unknown,
  /** Plain http is accepted only from the catalog's own origin (the fake one in checks). */
  httpOrigin: string | null = null,
): Omit<InstallableEntry, "installed">[] {
  const list = (raw as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  const standard = new Set(comfyFolderKeys());
  const out: Omit<InstallableEntry, "installed">[] = [];
  const seen = new Set<string>();
  for (const item of list as RawEntry[]) {
    const filename = text(item.filename);
    const url = text(item.url);
    const type = text(item.type) || "other";
    if (!safeName(filename) || !(/^https:\/\//i.test(url) || sameOrigin(url, httpOrigin))) continue;
    const folder = catalogFolder(type, text(item.save_path) || "default");
    const id = createHash("sha1")
      .update(`${folder ?? "?"}/${filename}`)
      .digest("hex")
      .slice(0, 16);
    if (seen.has(id)) continue;
    seen.add(id);
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    out.push({
      id,
      name: text(item.name) || filename,
      type,
      category: storeCategory(type),
      base: text(item.base) || null,
      description: text(item.description),
      reference: /^https?:\/\//i.test(text(item.reference)) ? text(item.reference) : null,
      filename,
      folder,
      kind: folder ? kindOfFolder(folder) : null,
      size: parseSize(text(item.size)),
      standard: folder ? standard.has(folder.split("/")[0] ?? "") || standard.has(folder) : false,
      host,
      url,
    });
  }
  return out;
}

export class ManagerCatalog {
  private readonly url: string;
  private readonly cacheFile: string;
  private readonly profiles: ProfileService;
  private readonly doFetch: typeof fetch;
  private readonly httpOrigin: string | null;
  private loaded: {
    at: number;
    stale: boolean;
    entries: Omit<InstallableEntry, "installed">[];
  } | null = null;
  private loading: Promise<void> | null = null;

  constructor(opts: {
    url: string;
    cacheDir: string;
    profiles: ProfileService;
    fetch?: typeof fetch;
  }) {
    this.url = opts.url;
    this.cacheFile = path.join(opts.cacheDir, "model-list.json");
    this.profiles = opts.profiles;
    this.doFetch = opts.fetch ?? fetch;
    const origin = new URL(opts.url).origin;
    this.httpOrigin = origin.startsWith("http:") ? origin : null;
  }

  private async load(force: boolean): Promise<void> {
    if (!force && this.loaded && Date.now() - this.loaded.at < DAY_MS) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const cached = await fs
        .readFile(this.cacheFile, "utf8")
        .then((t) => JSON.parse(t) as { at: number; body: unknown })
        .catch(() => null);
      if (!force && cached && Date.now() - cached.at < DAY_MS) {
        this.loaded = {
          at: cached.at,
          stale: false,
          entries: parseCatalog(cached.body, this.httpOrigin),
        };
        return;
      }
      try {
        const res = await fetchFollow(this.url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
          fetch: this.doFetch,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = JSON.parse(new TextDecoder().decode(await readLimited(res, MAX_BYTES)));
        const entries = parseCatalog(body, this.httpOrigin);
        if (!entries.length) throw new Error("empty catalog");
        const at = Date.now();
        await writeJsonAtomic(this.cacheFile, { at, body });
        this.loaded = { at, stale: false, entries };
      } catch {
        if (cached) {
          this.loaded = {
            at: cached.at,
            stale: true,
            entries: parseCatalog(cached.body, this.httpOrigin),
          };
          return;
        }
        throw new HttpError(
          502,
          "Couldn't load the ComfyUI model catalog. Check your internet connection, then try again.",
          "catalog_down",
        );
      }
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async root(): Promise<string> {
    const id = this.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return (await this.profiles.get(id)).paths.models.trim();
  }

  async catalog(force = false): Promise<Catalog> {
    await this.load(force);
    const root = await this.root();
    const rootOk = Boolean(root) && (await exists(root));
    const loaded = this.loaded;
    if (!loaded) throw new HttpError(502, "The catalog isn't loaded.", "catalog_down");
    const entries: CatalogEntry[] = await Promise.all(
      loaded.entries.map(async ({ url: _url, ...e }) => ({
        ...e,
        installed:
          rootOk && e.folder
            ? await exists(resolveInside(root, `${e.folder}/${e.filename}`))
            : false,
      })),
    );
    return { entries, fetchedAt: loaded.at, stale: loaded.stale, noModelsFolder: !rootOk };
  }

  async entry(id: string): Promise<InstallableEntry> {
    await this.load(false);
    const found = this.loaded?.entries.find((e) => e.id === id);
    if (!found) throw new HttpError(404, "That model isn't in the catalog anymore.", "no_entry");
    return { ...found, installed: false };
  }
}
