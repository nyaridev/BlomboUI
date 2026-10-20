/**
 * Wildcard files for the Wildcard Manager. Names are what prompts reference:
 *
 *   outfits/fantasy.txt                       → __outfits/fantasy__ (one option per line)
 *   any .yaml  { outfits: { fantasy: [a, b] } } → __outfits/fantasy__ (nested keys, list leaves)
 *
 * YAML keys are global, like the common Dynamic Prompts / Impact Pack format: the file's own
 * name isn't part of the reference. A .txt file wins when both define a name.
 */
import { z } from "zod";

export const WILDCARD_FORMATS = ["txt", "yaml"] as const;
export type WildcardFormat = (typeof WILDCARD_FORMATS)[number];

export function wildcardFormat(path: string): WildcardFormat | null {
  const p = path.toLowerCase();
  if (p.endsWith(".txt")) return "txt";
  if (p.endsWith(".yaml") || p.endsWith(".yml")) return "yaml";
  return null;
}

/** A relative path inside the wildcards folder: forward slashes, no "..", no drive. */
export const WildcardPath = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .transform((p) => p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
  .refine(
    (p) =>
      p.length > 0 && !p.split("/").some((part) => part === ".." || part === "" || part === "."),
    "Use a path inside the wildcards folder",
  )
  .refine((p) => !/[:*?"<>|]/.test(p), 'Use a name without : * ? " < > |');

export const WILDCARD_ENTRY_TYPES = ["file", "folder"] as const;
export const WildcardEntryType = z.enum(WILDCARD_ENTRY_TYPES);
export type WildcardEntryType = z.infer<typeof WildcardEntryType>;

export const WildcardEntry = z.object({
  path: z.string(),
  type: WildcardEntryType,
  format: z.enum(WILDCARD_FORMATS).nullable(),
  size: z.number(),
  mtime: z.number(),
});
export type WildcardEntry = z.infer<typeof WildcardEntry>;

/** GET /api/wildcards: the folder and every reference name in it. */
export const WildcardList = z.object({ root: z.string(), names: z.array(z.string()) });
export type WildcardList = z.infer<typeof WildcardList>;

export const WildcardTree = z.object({
  root: z.string(),
  exists: z.boolean(),
  entries: z.array(WildcardEntry),
  /** Every name a prompt can reference, from .txt files and YAML keys. */
  names: z.array(z.string()),
});
export type WildcardTree = z.infer<typeof WildcardTree>;

export const WildcardFile = z.object({
  path: z.string(),
  format: z.enum(WILDCARD_FORMATS),
  text: z.string(),
  mtime: z.number(),
});
export type WildcardFile = z.infer<typeof WildcardFile>;

export const SaveWildcardBody = z.object({
  path: WildcardPath,
  text: z.string().max(20 * 1024 * 1024),
  /** The mtime the editor loaded; a newer file on disk means someone else changed it. */
  baseMtime: z.number().nullable(),
});
export const CreateWildcardBody = z.object({
  path: WildcardPath,
  type: WildcardEntryType,
});
export const MoveWildcardBody = z.object({ from: WildcardPath, to: WildcardPath });
export const WildcardPathBody = z.object({ path: WildcardPath });

export const RollBody = z.object({
  text: z.string().min(1).max(20_000),
  count: z.number().int().min(1).max(50).default(8),
  seed: z.number().int().min(0).optional(),
  /** Unsaved editor content, by wildcard name, used instead of the files. */
  overrides: z.record(z.string(), z.array(z.string())).default({}),
});
export type RollBody = z.input<typeof RollBody>;

export const RollResult = z.object({
  rolls: z.array(
    z.object({
      seed: z.number(),
      text: z.string(),
      used: z.array(z.string()),
      missing: z.array(z.string()),
    }),
  ),
});
export type RollResult = z.infer<typeof RollResult>;

/** Flatten a parsed YAML document into reference name → options. */
export function flattenYamlWildcards(doc: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (node: unknown, prefix: string) => {
    if (Array.isArray(node)) {
      const lines = node
        .filter((v) => v !== null && v !== undefined && typeof v !== "object")
        .map((v) => String(v).trim())
        .filter((v) => v && !v.startsWith("#"));
      if (prefix) out.set(prefix, lines);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const key = String(k).trim();
        if (key) walk(v, prefix ? `${prefix}/${key}` : key);
      }
      return;
    }
    if (prefix && (typeof node === "string" || typeof node === "number")) {
      // A single string leaf is one option; a block of lines is several.
      const lines = String(node)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      out.set(prefix, lines);
    }
  };
  walk(doc, "");
  return out;
}

/** Reference name of a .txt wildcard file ("outfits/fantasy.txt" → "outfits/fantasy"). */
export function txtWildcardName(path: string): string {
  return path.replace(/\\/g, "/").replace(/\.txt$/i, "");
}
