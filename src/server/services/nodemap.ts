/**
 * ComfyUI-Manager's extension-node-map.json: which repository provides each custom node class
 * (ADR-0018). It sits next to the model catalog (model-list.json) in ComfyUI-Manager's repo, so
 * its address follows `--catalog`. Fetched once a day into runtime/cache/manager/; offline, the
 * cached copy is used, and without one the map is just empty (the workflow check then only knows
 * what the workflow itself names). Only github.com repositories are kept: those are what the
 * installer can download.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { NodePack } from "../../shared/workflow/packs.ts";
import { writeJsonAtomic } from "../lib/fsx.ts";
import { fetchFollow, readLimited } from "../lib/remote.ts";

const DAY_MS = 24 * 3600_000;
const MAX_BYTES = 32 * 1024 * 1024;

export interface NodeMapEntry {
  url: string;
  name: string;
  nodes: string[];
  /** Some packs name their classes by pattern instead of listing them all. */
  pattern: RegExp | null;
}

/** "https://github.com/a/b.git/" → "https://github.com/a/b", or null for anything else. */
export function githubRepo(raw: string): string | null {
  const url = raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  return NodePack.shape.url.safeParse(url).success ? url : null;
}

/** The JSON → entries. Pure. */
export function parseNodeMap(raw: unknown): NodeMapEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const out: NodeMapEntry[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const url = githubRepo(key);
    if (!url || !Array.isArray(value)) continue;
    const nodes = Array.isArray(value[0])
      ? value[0].filter((n): n is string => typeof n === "string")
      : [];
    const meta = (value[1] ?? {}) as { title_aux?: unknown; nodename_pattern?: unknown };
    let pattern: RegExp | null = null;
    if (typeof meta.nodename_pattern === "string")
      try {
        pattern = new RegExp(meta.nodename_pattern);
      } catch {
        pattern = null;
      }
    const name =
      typeof meta.title_aux === "string" && meta.title_aux.trim()
        ? meta.title_aux.trim()
        : (url.split("/").pop() ?? url);
    if (nodes.length || pattern) out.push({ url, name, nodes, pattern });
  }
  return out;
}

/** The pack that provides a class: one that lists it, else one whose pattern matches. */
export function packFor(entries: NodeMapEntry[], cls: string): NodeMapEntry | null {
  return (
    entries.find((e) => e.nodes.includes(cls)) ?? entries.find((e) => e.pattern?.test(cls)) ?? null
  );
}

export class NodeMap {
  private readonly url: string;
  private readonly cacheFile: string;
  private readonly doFetch: typeof fetch;
  private loaded: { at: number; entries: NodeMapEntry[] } | null = null;
  private loading: Promise<NodeMapEntry[]> | null = null;

  constructor(opts: { catalogUrl: string; cacheDir: string; fetch?: typeof fetch }) {
    this.url = new URL("extension-node-map.json", opts.catalogUrl).href;
    this.cacheFile = path.join(opts.cacheDir, "extension-node-map.json");
    this.doFetch = opts.fetch ?? fetch;
  }

  async entries(): Promise<NodeMapEntry[]> {
    if (this.loaded && Date.now() - this.loaded.at < DAY_MS) return this.loaded.entries;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(): Promise<NodeMapEntry[]> {
    const cached = await fs
      .readFile(this.cacheFile, "utf8")
      .then((t) => JSON.parse(t) as { at: number; body: unknown })
      .catch(() => null);
    if (cached && Date.now() - cached.at < DAY_MS) {
      this.loaded = { at: cached.at, entries: parseNodeMap(cached.body) };
      return this.loaded.entries;
    }
    try {
      const res = await fetchFollow(this.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
        fetch: this.doFetch,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = JSON.parse(new TextDecoder().decode(await readLimited(res, MAX_BYTES)));
      const entries = parseNodeMap(body);
      if (!entries.length) throw new Error("empty map");
      const at = Date.now();
      await writeJsonAtomic(this.cacheFile, { at, body });
      this.loaded = { at, entries };
    } catch {
      // Offline: yesterday's map, or none (try again in an hour rather than at every check).
      const entries = cached ? parseNodeMap(cached.body) : [];
      this.loaded = { at: Date.now() - DAY_MS + 3600_000, entries };
    }
    return this.loaded.entries;
  }
}
