/**
 * Prompt autocomplete: suggestions from tag lists, LoRAs and their trigger words, wildcards and
 * the tags this profile uses most. Tag lists use the CSV format the A1111 tag-complete
 * extension made common, one tag per row:
 *
 *   name,category,count,"alias1,alias2"
 *
 * (category: 0 general, 1 artist, 3 copyright, 4 character, 5 meta; count and aliases optional).
 * Bundled lists live in presets/tags/, the profile's own in data/profiles/<id>/tags/.
 */
import { z } from "zod";

export const SUGGESTION_KINDS = ["tag", "lora", "trigger", "wildcard"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** What the text at the cursor asks for. */
export const COMPLETE_MODES = ["tag", "lora", "wildcard"] as const;
export type CompleteMode = (typeof COMPLETE_MODES)[number];

export const Suggestion = z.object({
  kind: z.enum(SUGGESTION_KINDS),
  /** What goes into the prompt (before the editor's own formatting of tags). */
  text: z.string(),
  /** What the list shows. */
  label: z.string(),
  /** Small text on the right ("12k", "alias of …", "trigger · Detail Tweaker"). */
  detail: z.string().nullable(),
  /** Tag category (0 general, 1 artist, 3 copyright, 4 character, 5 meta). */
  category: z.number().int().nullable(),
  /** A thumbnail URL (LoRAs). */
  thumb: z.string().nullable(),
  /** Marked NSFW: the thumbnail is blurred when the profile blurs NSFW. */
  nsfw: z.boolean(),
  /** Times this profile used it (frequent tags). */
  uses: z.number().int().nullable(),
  /** LoRA trigger words, inserted with it when the setting says so. */
  triggers: z.array(z.string()).optional(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestQuery = z.object({
  q: z.string().max(200),
  mode: z.enum(COMPLETE_MODES).default("tag"),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type SuggestQuery = z.infer<typeof SuggestQuery>;

export const TagListInfo = z.object({
  /** "bundled:<file>" or "profile:<file>". */
  id: z.string(),
  name: z.string(),
  source: z.enum(["bundled", "profile"]),
  file: z.string(),
  tags: z.number().int(),
  enabled: z.boolean(),
  /** Why it couldn't be read, if it couldn't. */
  error: z.string().nullable(),
});
export type TagListInfo = z.infer<typeof TagListInfo>;

export const TagListsResponse = z.object({
  lists: z.array(TagListInfo),
  /** The profile's tags folder, for "Show folder". */
  folder: z.string(),
  frequent: z.array(z.object({ tag: z.string(), uses: z.number().int() })),
});
export type TagListsResponse = z.infer<typeof TagListsResponse>;

export const TagListName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((s) => /^[^\\/:*?"<>|]+\.csv$/i.test(s), "Use a .csv file name without folders");

export interface TagRow {
  name: string;
  category: number;
  count: number;
  aliases: string[];
}

/** Split one CSV line, honoring double-quoted fields with "" escapes. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Rows of a tag list. Header rows, blank lines and rows without a name are skipped. */
export function parseTagCsv(text: string): TagRow[] {
  const rows: TagRow[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name = "", category = "", count = "", aliases = ""] = splitCsv(line);
    const tag = name.trim();
    if (!tag || (tag.toLowerCase() === "name" && rows.length === 0 && !/\d/.test(count))) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = Number.parseInt(category, 10);
    const n = Number.parseInt(count, 10);
    rows.push({
      name: tag,
      category: Number.isFinite(cat) ? cat : 0,
      count: Number.isFinite(n) ? n : 0,
      aliases: aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    });
  }
  return rows;
}

/** Comparable form of a tag: lowercase, spaces as underscores, escapes removed. */
export function normalizeTag(tag: string): string {
  return tag
    .replace(/\\([()[\]])/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * The plain tags of a prompt, for "frequent tags": split at commas, weights and brackets
 * removed, LoRA tags, wildcards, choices and BREAK skipped.
 */
export function promptTags(text: string): string[] {
  const out: string[] = [];
  const cleaned = text
    .replace(/<[^>]*>/g, ",")
    .replace(/__[^_\s][^\s,]*?__/g, ",")
    .replace(/\{[^}]*\}/g, ",")
    .replace(/\bBREAK\b/g, ",");
  for (const part of cleaned.split(/[,\n]/)) {
    // Escaped brackets are part of the tag; the others are weights and emphasis.
    const tag = part
      .replace(/\\\(/g, "\uE001")
      .replace(/\\\)/g, "\uE002")
      .replace(/:\s*-?\d+(\.\d+)?\s*\)/g, ")")
      .replace(/[()[\]]/g, "")
      .replace(/\uE001/g, "(")
      .replace(/\uE002/g, ")")
      .replace(/\s+/g, " ")
      .trim();
    if (tag.length >= 2 && tag.length <= 60) out.push(normalizeTag(tag));
  }
  return [...new Set(out)];
}

/** Compact counts for the suggestion list ("1.2M", "34k", "512"). */
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export interface CompleteContext {
  mode: CompleteMode;
  /** Offset where the replaced text starts. */
  from: number;
  /** What's typed so far (without "<lora:" or "__"). */
  query: string;
}

/**
 * What to complete at `pos` in a prompt: a LoRA after "<" or "<lora:", a wildcard after "__",
 * otherwise the tag since the last comma, bracket or line break. Null inside a LoRA's
 * strength or when nothing is typed.
 */
export function completeContext(text: string, pos: number): CompleteContext | null {
  const before = text.slice(0, pos);
  // "<", "<lo", "<det" or "<lora:det": a LoRA. Past its name (a strength) there's nothing.
  const lora = /<([^<>:]*)(?::([^<>:]*))?$/.exec(before);
  if (lora) {
    const head = lora[1] ?? "";
    if (lora[2] !== undefined)
      return head.toLowerCase() === "lora"
        ? { mode: "lora", from: lora.index, query: lora[2] }
        : null;
    const typingLora = "lora".startsWith(head.toLowerCase());
    return { mode: "lora", from: lora.index, query: typingLora ? "" : head };
  }
  if (/<[^>]*$/.test(before)) return null;
  const wc = /__([^_\s,][^\s,]*)?$/.exec(before);
  if (wc) return { mode: "wildcard", from: wc.index, query: (wc[1] ?? "").replace(/_+$/, "") };
  let a = pos;
  while (a > 0 && !/[,\n(){}[\]|]/.test(before[a - 1] ?? "")) {
    // "\(" belongs to the tag.
    if ((before[a - 1] === "(" || before[a - 1] === ")") && before[a - 2] === "\\") {
      a -= 2;
      continue;
    }
    a--;
  }
  while (a < pos && /\s/.test(before[a] ?? "")) a++;
  const query = before.slice(a);
  if (!query.trim() || /:\s*-?[\d.]*$/.test(query)) return null;
  return { mode: "tag", from: a, query };
}

/** How a tag goes into the prompt, per the autocomplete settings. */
export function formatTag(
  tag: string,
  opts: { replaceUnderscores: boolean; escapeParens: boolean },
): string {
  let t = tag;
  // Emoticons like ^_^ or >_< keep their underscores.
  if (opts.replaceUnderscores && /[a-z0-9]_|_[a-z0-9]/i.test(t)) t = t.replace(/_/g, " ");
  if (opts.escapeParens) t = t.replace(/(?<!\\)([()])/g, "\\$1");
  return t;
}
