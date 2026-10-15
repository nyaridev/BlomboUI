/**
 * Profile schemas (ADR-0006). A profile is a folder under data/profiles/<id>/ holding
 * profile.json, settings.json, workflows/, layouts/ and one SQLite file.
 */
import { z } from "zod";
import { ACCENTS, THEMES } from "./constants.ts";

export const ProfileId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Invalid profile id");

export const ProfilePaths = z.object({
  /** ComfyUI models root (checkpoints/, loras/, vae/ …). Also the Models view's root. */
  models: z.string().default(""),
  /** Where generated images are written. */
  outputs: z.string().default(""),
  /** Wildcard .txt / .yaml root. */
  wildcards: z.string().default(""),
});
export type ProfilePaths = z.infer<typeof ProfilePaths>;

export const ComfyTarget = z.discriminatedUnion("mode", [
  /** Managed install under runtime/comfyui/<slot>/. */
  z.object({ mode: z.literal("managed"), slot: z.string().default("latest") }),
  /** A ComfyUI the user runs themselves. */
  z.object({ mode: z.literal("external"), url: z.string().url() }),
]);
export type ComfyTarget = z.infer<typeof ComfyTarget>;

export const Profile = z.object({
  id: ProfileId,
  name: z.string().trim().min(1).max(40),
  accent: z.enum(ACCENTS).default("blue"),
  theme: z.enum(THEMES).default("blombo"),
  hasAvatar: z.boolean().default(false),
  paths: ProfilePaths.default({ models: "", outputs: "", wildcards: "" }),
  comfy: ComfyTarget.default({ mode: "managed", slot: "latest" }),
  createdAt: z.string(),
  lastOpenedAt: z.string().nullable().default(null),
  /** Cached counters for the profile screen; refreshed by the gallery indexer. */
  stats: z.object({ images: z.number().int().nonnegative().default(0) }).default({ images: 0 }),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileRegistry = z.object({
  version: z.literal(1).default(1),
  order: z.array(ProfileId).default([]),
  /** When set, launching skips the profile screen and opens this profile. */
  openOnLaunch: ProfileId.nullable().default(null),
});
export type ProfileRegistry = z.infer<typeof ProfileRegistry>;

export const CreateProfileBody = z.object({
  name: Profile.shape.name,
  accent: z.enum(ACCENTS).default("blue"),
  theme: z.enum(THEMES).default("blombo"),
  paths: ProfilePaths,
  comfy: ComfyTarget.default({ mode: "managed", slot: "latest" }),
  /** Preset workflow ids to install into the new profile. */
  presets: z.array(z.string()).default([]),
});
export type CreateProfileBody = z.infer<typeof CreateProfileBody>;

/**
 * A partial update: only the fields sent change. Written out without defaults on purpose; a
 * `.partial()` of the create schema would fill the missing fields with their defaults.
 */
export const UpdateProfileBody = z.object({
  name: Profile.shape.name.optional(),
  accent: z.enum(ACCENTS).optional(),
  theme: z.enum(THEMES).optional(),
  paths: z
    .object({ models: z.string(), outputs: z.string(), wildcards: z.string() })
    .partial()
    .optional(),
  comfy: ComfyTarget.optional(),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

export const CheckPathBody = z.object({ path: z.string() });
export const CheckPathResult = z.object({
  path: z.string(),
  exists: z.boolean(),
  isDirectory: z.boolean(),
  writable: z.boolean(),
  /** For a models root: which ComfyUI model folders were found inside. */
  modelFolders: z.array(z.string()).default([]),
});
export type CheckPathResult = z.infer<typeof CheckPathResult>;

/** Slug a display name into a readable, unique-ish id ("Night Owl" → "night-owl"). */
export function slugifyProfileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "profile";
}
