/**
 * Where Blombo saves things in the main output folder, as patterns with placeholders
 * (Settings → Saving): "[workflow]/images/[date]/blombo_[number]". One pattern per kind of
 * file; the extension comes from the format.
 *
 *   images       what ComfyUI saves. Its counter always ends the name ("_00001_"), so the
 *                pattern must end with [number] (an "_" before it is ComfyUI's own).
 *   grids        batch, matrix and XY grids Blombo puts together ([number]: the next free one)
 *   interrupted  where a stopped run's images move ([name]: the image's own name)
 *   jpegCopies   JPEG copies of large images ([name] as above)
 *
 * The gallery tells grids, stopped runs' images and JPEG copies apart by a folder with a fixed
 * name in their pattern (the last one, `markerOf`), so those patterns need one, and it can't be a
 * folder images are saved in.
 */
import { z } from "zod";

export const SAVE_KINDS = ["images", "grids", "interrupted", "jpegCopies"] as const;
export type SaveKind = (typeof SAVE_KINDS)[number];

export const DEFAULT_PATHS: Record<SaveKind, string> = {
  images: "[workflow]/images/[date]/blombo_[number]",
  grids: "[workflow]/grids/[date]/[kind]-[time]",
  interrupted: "[workflow]/interrupted/[date]/[name]",
  jpegCopies: "[workflow]/jpeg/[date]/[name]",
};

export const PLACEHOLDERS: Array<{
  token: string;
  label: string;
  example: string;
  kinds: readonly SaveKind[];
}> = [
  {
    token: "workflow",
    label: "The workflow's folder name",
    example: "illustrious-xl",
    kinds: SAVE_KINDS,
  },
  { token: "date", label: "Today, year-month-day", example: "2026-11-06", kinds: SAVE_KINDS },
  { token: "year", label: "Year", example: "2026", kinds: SAVE_KINDS },
  { token: "month", label: "Month", example: "11", kinds: SAVE_KINDS },
  { token: "day", label: "Day of the month", example: "06", kinds: SAVE_KINDS },
  { token: "time", label: "Time, hours minutes seconds", example: "142233", kinds: SAVE_KINDS },
  { token: "seed", label: "The run's seed", example: "1234567890", kinds: SAVE_KINDS },
  { token: "width", label: "Image width", example: "832", kinds: SAVE_KINDS },
  { token: "height", label: "Image height", example: "1216", kinds: SAVE_KINDS },
  {
    token: "model",
    label: "The checkpoint or diffusion model, without its extension",
    example: "illustriousXL_v01",
    kinds: SAVE_KINDS,
  },
  {
    token: "number",
    label: "A counter: ComfyUI's for images (always last), the next free one for grids",
    example: "00001",
    kinds: ["images", "grids"],
  },
  {
    token: "kind",
    label: "What made the grid: batch, matrix or xy",
    example: "batch",
    kinds: ["grids"],
  },
  {
    token: "name",
    label: "The image's own file name, without its extension",
    example: "blombo_00001_",
    kinds: ["interrupted", "jpegCopies"],
  },
];

export type PathVars = Partial<Record<string, string | number | null>>;

const TOKEN = /\[([a-z]+)\]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters can't be in a file name
const BAD_CHARS = /[<>:"\\|?*\u0000-\u001f]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters can't be in a file name
const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Folders of a pattern, its file name last. */
const parts = (pattern: string) => pattern.split("/");

/** The last folder of a pattern with no placeholder in it, or null. */
export function markerOf(pattern: string): string | null {
  const folders = parts(pattern).slice(0, -1);
  return folders.findLast((f) => f !== "" && !f.includes("[")) ?? null;
}

/** What's wrong with a pattern, or null when it can be used. */
export function checkPattern(
  kind: SaveKind,
  pattern: string,
  imagesPattern = DEFAULT_PATHS.images,
): string | null {
  const p = pattern.trim();
  if (!p) return "Write a pattern.";
  if (p.length > 200) return "Keep it under 200 characters.";
  if (/^[a-z]:|^\/|\/$/i.test(p) || p.includes("//"))
    return "Write a path inside the output folder, with a file name at the end.";
  if (parts(p).some((s) => s === ".." || s === ".")) return "Don't use . or .. as a folder.";
  if (BAD_CHARS.test(p)) return 'Leave out < > : " \\ | ? * (use / between folders).';
  const allowed = new Set(PLACEHOLDERS.filter((x) => x.kinds.includes(kind)).map((x) => x.token));
  for (const [, token] of p.matchAll(TOKEN))
    if (!allowed.has(token ?? "")) return `[${token}] doesn't work here.`;
  if (/\[[^\]]*$|^[^[]*\]/.test(p.replace(TOKEN, ""))) return "A bracket isn't closed.";
  const file = parts(p).at(-1) ?? "";
  if (kind === "images" && !file.endsWith("[number]"))
    return "End the file name with [number]: ComfyUI always adds its counter there.";
  if (kind === "images" && (file.match(TOKEN) ?? []).filter((t) => t === "[number]").length > 1)
    return "Use [number] once.";
  if (kind !== "images") {
    const marker = markerOf(p);
    if (!marker)
      return "Add a folder with a fixed name (like grids/) so the gallery can tell these apart.";
    if (parts(imagesPattern).slice(0, -1).includes(marker))
      return `Images are saved in a "${marker}" folder too: pick another name.`;
  }
  return null;
}

/** A value made safe for a file or folder name. */
function safe(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(UNSAFE, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 80);
}

/** Date placeholders for a moment. */
export function timeVars(at: Date): PathVars {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [year, month, day] = [at.getFullYear(), pad(at.getMonth() + 1), pad(at.getDate())];
  return {
    year,
    month,
    day,
    date: `${year}-${month}-${day}`,
    time: `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`,
  };
}

/**
 * A pattern with its placeholders filled in (unknown ones empty), as a path with forward
 * slashes. Empty folders are dropped; an empty file name becomes "image".
 */
export function resolvePattern(pattern: string, vars: PathVars): string {
  const segs = parts(pattern.trim()).map((seg) =>
    seg.replace(TOKEN, (_, token: string) => safe(vars[token])).replace(/^[\s.]+|[\s.]+$/g, ""),
  );
  const file = segs.pop() || "image";
  return [...segs.filter(Boolean), file].join("/");
}

/**
 * ComfyUI's `filename_prefix` for an images pattern: [number] and the "_" before it go, since
 * ComfyUI writes "_00001_" there itself.
 */
export function comfyPrefix(pattern: string, vars: PathVars): string {
  return resolvePattern(pattern.trim().replace(/_?\[number\]$/, ""), vars);
}

/**
 * The next free [number] for a file name pattern among the names already in its folder:
 * one past the highest that matches, five digits.
 */
export function nextNumber(filePattern: string, vars: PathVars, names: string[]): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const [before = "", after = ""] = filePattern.split("[number]");
  const side = (s: string) =>
    s
      .split(TOKEN)
      .map((piece, i) => (i % 2 ? esc(safe(vars[piece])) : esc(piece)))
      .join("");
  const re = new RegExp(`^${side(before)}(\\d+)${side(after)}(\\.[^.]+)?$`, "i");
  let max = 0;
  for (const n of names) {
    const m = re.exec(n);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(5, "0");
}

/** One pattern, checked (an invalid one falls back to its default when settings are read). */
export const pathPattern = (kind: SaveKind) =>
  z
    .string()
    .trim()
    .refine((p) => checkPattern(kind, p) === null, { message: `Not a usable ${kind} pattern` })
    .default(DEFAULT_PATHS[kind]);
