/**
 * Moves model pictures from the flat layout Blombo wrote before scopes came back
 * (`<model>_data/thumb.*`, `thumb_raw.*`) to the scopes layout (`<model>_data/thumbs/global.*`,
 * `global_raw.*`, ADR-0019). Walks every `*_data` folder under the folder you give it. Never
 * overwrites or deletes: a picture whose new name is taken stays where it is and is listed.
 *
 *   node tools/move-model-pictures.ts <models folder> [--dry-run]
 *
 * Close Blombo first, or rescan Models afterwards.
 */
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_SUFFIX, moveFlatPictures } from "../src/server/services/modelthumbs.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const root = args.find((a) => !a.startsWith("--"));
if (!root) {
  console.error("Usage: node tools/move-model-pictures.ts <models folder> [--dry-run]");
  process.exit(1);
}

const FLAT = /^thumb(_raw)?\.[^.]+$/i;
let folders = 0;
let moved = 0;
const skipped: string[] = [];

async function walk(dir: string, depth = 0): Promise<void> {
  if (depth > 16) return;
  let items: Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of items) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (!e.name.endsWith(DATA_SUFFIX)) {
      await walk(full, depth + 1);
      continue;
    }
    const flat = (await fs.readdir(full)).filter((n) => FLAT.test(n));
    if (!flat.length) continue;
    folders++;
    if (dry) {
      for (const n of flat) console.log(`would move ${path.join(full, n)}`);
      moved += flat.length;
      continue;
    }
    const r = await moveFlatPictures(full);
    moved += r.moved.length;
    skipped.push(...r.skipped);
  }
}

await walk(path.resolve(root));
console.log(
  `${dry ? "Would move" : "Moved"} ${moved} file${moved === 1 ? "" : "s"} in ${folders} model folder${folders === 1 ? "" : "s"}.`,
);
if (skipped.length) {
  console.log(`Left ${skipped.length} where they are (thumbs/ already has that picture):`);
  for (const f of skipped) console.log(`  ${f}`);
}
