/**
 * Scopes: thumbnails of models per context. A scope ("Anime", "Photo", "Safe for work") holds
 * its own picture for any model, so a LoRA can show how it looks in each style. Pictures live in
 * the profile (data/profiles/<id>/scopes/<scope>/<kind>/<ComfyUI name>.webp) and never touch
 * the models folder. The list of scopes, their groups and the prompt tags that pick them are in
 * scopes.json next to them.
 *
 * Which scope a card shows: the picked one (`active`), or with `auto` on, the scope whose tags
 * best match the prompt on the Generate screen. A model without a picture in that scope falls
 * back to its own preview file, then to the default scope's picture.
 */
import { z } from "zod";
import { MODEL_KINDS, type ModelKind } from "./constants.ts";
import { cleanTag } from "./prompt/explain.ts";
import { ScopeName } from "./scripts.ts";

export { ScopeName };

export const DEFAULT_SCOPE = "default";

export const ScopeDef = z.object({
  id: ScopeName,
  name: z.string().trim().min(1).max(60),
  /** Scopes with the same group are listed together ("Styles", "Characters"). */
  group: z.string().trim().max(40).default(""),
  /** Prompt tags that pick this scope when auto is on ("anime", "photorealistic"). */
  tags: z.array(z.string().trim().min(1).max(60)).max(60).default([]),
});
export type ScopeDef = z.infer<typeof ScopeDef>;

export const ScopesFile = z.object({
  format: z.literal("blombo.scopes/1").default("blombo.scopes/1"),
  /** The scope cards show when auto is off (or no scope's tags are in the prompt). */
  active: ScopeName.default(DEFAULT_SCOPE),
  /** Pick the scope from the prompt's tags on the Generate screen. */
  auto: z.boolean().default(false),
  scopes: z.array(ScopeDef).max(200).default([]),
});
export type ScopesFile = z.infer<typeof ScopesFile>;

/** GET /api/scopes: the file, plus every scope's pictures by model key. */
export const ScopesState = ScopesFile.extend({
  /** scope id → model key (`scopeKey`: "loras/style/foo.safetensors") → thumbnail URL. */
  thumbs: z.record(z.string(), z.record(z.string(), z.string())),
});
export type ScopesState = z.infer<typeof ScopesState>;

export const SaveScopeBody = z.object({
  name: ScopeDef.shape.name,
  group: ScopeDef.shape.group,
  tags: ScopeDef.shape.tags,
});
export type SaveScopeBody = z.input<typeof SaveScopeBody>;

export const ScopeSettingsBody = z.object({
  active: ScopeName.optional(),
  auto: z.boolean().optional(),
});

/** Which model a picture is for: its kind and the name ComfyUI lists it under. */
export const ScopeThumbTarget = z.object({
  kind: z.enum(MODEL_KINDS),
  name: z.string().min(1).max(400),
});

export const ScopeThumbFromImageBody = ScopeThumbTarget.extend({
  /** A gallery image to make the picture from. */
  imageId: z.number().int().min(1),
});

/** The key a model's picture has in a scope: its kind and ComfyUI name. */
export function scopeKey(kind: ModelKind, comfyName: string): string {
  return `${kind}/${comfyName.replace(/\\/g, "/")}`;
}

/** The name ComfyUI lists a local model under (its path inside the kind folder). */
export function comfyNameOf(model: { folder: string; file: string }): string {
  return model.folder ? `${model.folder}/${model.file}` : model.file;
}

/** "(Long_Hair:1.2)" → "long hair": a prompt tag in the form scope tags are compared in. */
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
 * The scope a prompt picks: the one with the most of its tags in the prompt (ties go to the one
 * listed first). Null when no scope's tags are there.
 */
export function pickScope(
  prompt: string,
  scopes: ScopeDef[],
): { id: string; matched: string[] } | null {
  const tags = promptTags(prompt);
  if (!tags.size) return null;
  let best: { id: string; matched: string[] } | null = null;
  for (const s of scopes) {
    const matched = s.tags.filter((t) => tags.has(normalizeTag(t)));
    if (matched.length && (!best || matched.length > best.matched.length))
      best = { id: s.id, matched };
  }
  return best;
}

/** The default scope is always there, first. */
export function withDefaultScope(scopes: ScopeDef[]): ScopeDef[] {
  if (scopes.some((s) => s.id === DEFAULT_SCOPE)) {
    const d = scopes.find((s) => s.id === DEFAULT_SCOPE) as ScopeDef;
    return [d, ...scopes.filter((s) => s.id !== DEFAULT_SCOPE)];
  }
  return [{ id: DEFAULT_SCOPE, name: "Default", group: "", tags: [] }, ...scopes];
}
