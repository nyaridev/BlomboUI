/**
 * Wildcard files from a profile's wildcards folder: `__outfits/fantasy__` reads
 * <wildcards>/outfits/fantasy.txt. Files are read on demand (and nested wildcards followed) so
 * the compiler gets a plain synchronous lookup. Reading never modifies the folder.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  findWildcards,
  type WildcardResolver,
  wildcardLines,
} from "../../shared/prompt/wildcards.ts";

const MAX_FILES = 5000;

function fileFor(root: string, name: string): string | null {
  const rel = `${name.replace(/\\/g, "/")}.txt`;
  const target = path.resolve(root, rel);
  const inside = path.relative(root, target);
  return inside.startsWith("..") || path.isAbsolute(inside) ? null : target;
}

/** Load every wildcard the texts use (and the ones those use) into a resolver. */
export async function loadWildcards(root: string, texts: string[]): Promise<WildcardResolver> {
  const found = new Map<string, string[]>();
  if (!root.trim()) return () => undefined;
  let pending = [...new Set(texts.flatMap(findWildcards))];
  for (let depth = 0; pending.length && depth < 10; depth++) {
    const next: string[] = [];
    for (const name of pending) {
      if (found.has(name)) continue;
      const file = fileFor(root, name);
      let lines: string[] = [];
      if (file) {
        try {
          lines = wildcardLines(await fs.readFile(file, "utf8"));
        } catch {
          lines = [];
        }
      }
      found.set(name, lines);
      for (const line of lines)
        for (const inner of findWildcards(line)) if (!found.has(inner)) next.push(inner);
    }
    pending = next;
  }
  return (name) => {
    const lines = found.get(name);
    return lines?.length ? lines : undefined;
  };
}

/** Wildcard names under the folder ("outfits/fantasy"), for pickers. */
export async function listWildcards(root: string): Promise<string[]> {
  if (!root.trim()) return [];
  const out: string[] = [];
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".txt"))
        out.push(
          path
            .relative(root, full)
            .replace(/\\/g, "/")
            .replace(/\.txt$/i, ""),
        );
    }
  };
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}
