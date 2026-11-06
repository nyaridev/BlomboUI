/**
 * Scopes: more than one picture per model, by context (ADR-0019). A scope ("Skirt",
 * "Thighhighs", "Anime") has a random id; a model can keep a picture for one scope or for a
 * combination of them, saved in its data folder under the scope ids:
 *
 *   Detailer_data/thumbs/global.jpg                    the picture everyone sees
 *   Detailer_data/thumbs/<id>.jpg                      one scope's picture
 *   Detailer_data/thumbs/<id>+<id>.jpg                 a combination (ids sorted)
 *   …and each one's original beside it as <key>_raw.png
 *
 * The names are the old app's, so its files keep working. Which scopes exist, whether scopes are
 * on (off by default) and which ones cards show are the profile's, in scopes.json.
 */
import { z } from "zod";
import { cleanTag } from "./prompt/explain.ts";

/** The picture with no scope: what every card shows while scopes are off. */
export const GLOBAL_KEY = "global";
/** A picture can be for at most this many scopes at once (keeps file names short). */
export const MAX_COMBO = 6;

const ID = /^[a-f0-9]{12}$/;
const KEY = new RegExp(`^[a-f0-9]{12}(?:\\+[a-f0-9]{12}){0,${MAX_COMBO - 1}}$`);

export const ScopeId = z.string().regex(ID, "A scope id is 12 hex characters.");

export const ScopeDef = z.object({
  id: ScopeId,
  name: z.string().trim().min(1, "Give the scope a name.").max(60),
  /** Scopes in the same group replace each other when picked ("Style": Anime, Photo). */
  group: z.string().trim().max(40).default(""),
  /** Prompt tags that pick it while Auto is on ("skirt", "miniskirt"). */
  tags: z.array(z.string().trim().min(1).max(80)).max(80).default([]),
});
export type ScopeDef = z.infer<typeof ScopeDef>;

/** Which scopes cards show. */
export const ScopeView = z.object({
  /** Picked scopes, in the order they were picked. */
  ids: z.array(ScopeId).max(20).default([]),
  /** Picked scopes that a picture may leave out (the others it must have). */
  optional: z.array(ScopeId).max(20).default([]),
  /** Pick from the Generate prompt's tags instead (those count as optional). */
  auto: z.boolean().default(false),
});
export type ScopeView = z.infer<typeof ScopeView>;

export const ScopesFile = z.object({
  format: z.literal("blombo.scopes/2").default("blombo.scopes/2"),
  enabled: z.boolean().default(false),
  scopes: z.array(ScopeDef).max(500).default([]),
  view: ScopeView.default(ScopeView.parse({})),
});
export type ScopesFile = z.infer<typeof ScopesFile>;

/** POST /api/scopes and PUT /api/scopes/:id. */
export const SaveScopeBody = ScopeDef.omit({ id: true });
export type SaveScopeBody = z.input<typeof SaveScopeBody>;

/** PATCH /api/scopes: turn scopes on or off, or change what cards show. */
export const ScopesPatch = z.object({
  enabled: z.boolean().optional(),
  view: ScopeView.optional(),
});
export type ScopesPatch = z.infer<typeof ScopesPatch>;

/** DELETE /api/scopes/:id answers how many pictures went to the trash with it. */
export interface DeletedScope {
  pictures: number;
}

/* ── picture keys ─────────────────────────────────────────────────────── */

/** The file name a set of scopes is saved under: sorted ids joined by "+", or "global". */
export function pictureKey(ids: readonly string[]): string {
  const unique = [...new Set(ids)].sort();
  return unique.length ? unique.join("+") : GLOBAL_KEY;
}

/** The scope ids in a picture key ([] for global). */
export function keyIds(key: string): string[] {
  return key === GLOBAL_KEY ? [] : key.split("+");
}

/** A key a request may name: "global" or 1–6 scope ids. Returns it sorted, or null. */
export function cleanKey(raw: string | undefined | null): string | null {
  const key = (raw ?? "").trim().toLowerCase() || GLOBAL_KEY;
  if (key === GLOBAL_KEY) return key;
  if (!KEY.test(key)) return null;
  const ids = key.split("+");
  return new Set(ids).size === ids.length ? pictureKey(ids) : null;
}

/** "Skirt + Thighhighs" (an id no scope has shows as "Unknown scope"). */
export function keyLabel(key: string, scopes: readonly ScopeDef[]): string {
  if (key === GLOBAL_KEY) return "Global";
  const names = new Map(scopes.map((s) => [s.id, s.name]));
  return keyIds(key)
    .map((id) => names.get(id) ?? "Unknown scope")
    .sort((a, b) => a.localeCompare(b))
    .join(" + ");
}

/** A new scope id: 12 random hex characters. */
export function newScopeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── which picture a card shows ───────────────────────────────────────── */

export interface ScopedPicture {
  key: string;
  mtime: number;
}

/**
 * The picture that fits the picked scopes best, or null (show the global one). A picture fits
 * when it has every required scope, or with only optional ones picked, at least one of them.
 * Among those: the one with the most picked scopes, then the fewest scopes nobody picked, then
 * the newest.
 */
export function pickPicture<T extends ScopedPicture>(
  pictures: readonly T[],
  picked: readonly string[],
  optional: readonly string[] = [],
): T | null {
  if (!picked.length) return null;
  const want = new Set(picked);
  const maybe = new Set(optional.filter((id) => want.has(id)));
  const required = [...want].filter((id) => !maybe.has(id));
  let best: { pic: T; hits: number; extra: number } | null = null;
  for (const pic of pictures) {
    if (pic.key === GLOBAL_KEY) continue;
    const ids = new Set(keyIds(pic.key));
    if (!required.every((id) => ids.has(id))) continue;
    const hits = [...want].filter((id) => ids.has(id)).length;
    if (!hits) continue;
    const extra = ids.size - hits;
    if (
      !best ||
      hits > best.hits ||
      (hits === best.hits && extra < best.extra) ||
      (hits === best.hits && extra === best.extra && pic.mtime > best.pic.mtime)
    )
      best = { pic, hits, extra };
  }
  return best?.pic ?? null;
}

/** Picking a scope drops the others in its group; picking it again drops it. */
export function togglePick(view: ScopeView, id: string, scopes: readonly ScopeDef[]): ScopeView {
  if (view.ids.includes(id))
    return {
      ...view,
      ids: view.ids.filter((x) => x !== id),
      optional: view.optional.filter((x) => x !== id),
    };
  const group = scopes.find((s) => s.id === id)?.group.toLowerCase();
  const sameGroup = (x: string) =>
    Boolean(group) && scopes.find((s) => s.id === x)?.group.toLowerCase() === group;
  const ids = [...view.ids.filter((x) => !sameGroup(x)), id];
  return { ...view, ids, optional: view.optional.filter((x) => ids.includes(x)) };
}

/* ── Auto: scopes from the prompt ─────────────────────────────────────── */

/** "(Long_Hair:1.2)" → "long hair": a tag in the form scope tags are compared in. */
export function normalizeTag(tag: string): string {
  return cleanTag(tag)
    .replace(/[{}]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The tags of a prompt (comma separated, LoRA tags and BREAK left out), normalized. */
export function promptTags(prompt: string): Set<string> {
  const text = prompt.replace(/<[^>]*>/g, ",").replace(/\bBREAK\b/g, ",");
  const out = new Set<string>();
  for (const part of text.split(/[,\n|]/)) {
    const t = normalizeTag(part);
    if (t) out.add(t);
  }
  return out;
}

/**
 * The scopes a prompt picks: every scope with one of its tags in the prompt, and in a group only
 * the one with the most tags there (ties go to the one listed first).
 */
export function autoScopes(prompt: string, scopes: readonly ScopeDef[]): string[] {
  const tags = promptTags(prompt);
  if (!tags.size) return [];
  const best = new Map<string, { id: string; hits: number }>();
  const out: string[] = [];
  for (const s of scopes) {
    const hits = s.tags.filter((t) => tags.has(normalizeTag(t))).length;
    if (!hits) continue;
    const group = s.group.toLowerCase();
    if (!group) {
      out.push(s.id);
      continue;
    }
    const prev = best.get(group);
    if (!prev || hits > prev.hits) best.set(group, { id: s.id, hits });
  }
  const grouped = new Set([...best.values()].map((b) => b.id));
  // Keep the scopes' own order.
  return scopes.filter((s) => out.includes(s.id) || grouped.has(s.id)).map((s) => s.id);
}

/** What cards show: the picked scopes and the optional ones, Auto worked out. */
export function effectivePick(
  file: Pick<ScopesFile, "enabled" | "scopes" | "view">,
  prompt: string,
): { ids: string[]; optional: string[] } {
  if (!file.enabled) return { ids: [], optional: [] };
  if (file.view.auto) {
    const ids = autoScopes(prompt, file.scopes);
    return { ids, optional: ids };
  }
  const known = new Set(file.scopes.map((s) => s.id));
  const ids = file.view.ids.filter((id) => known.has(id));
  return { ids, optional: file.view.optional.filter((id) => ids.includes(id)) };
}
