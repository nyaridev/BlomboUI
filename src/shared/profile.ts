/**
 * Profile schemas (ADR-0006). A profile is a folder under data/profiles/<id>/ holding
 * profile.json, settings.json, workflows/, layouts/ and one SQLite file.
 */
import { z } from "zod";
import { ACCENTS, THEMES } from "./constants.ts";
import { slugId } from "./settings.ts";

export const ProfileId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Invalid profile id");

/** The three main folders the profile wizard picks (each can be empty). */
export const ProfilePaths = z.object({
  /** ComfyUI models root (checkpoints/, loras/, vae/ …). Also the Models view's root. */
  models: z.string().default(""),
  /** Where generated images are written. */
  outputs: z.string().default(""),
  /** Wildcard .txt / .yaml root. */
  wildcards: z.string().default(""),
});
export type ProfilePaths = z.infer<typeof ProfilePaths>;

/**
 * A profile's folders, per kind (ADR-0017). The first one of a kind is its main folder: the
 * only one Blombo saves new things into (generated images, downloaded models, batch results).
 * The others are read, shown and edited in place (renames, model pictures, wildcard edits).
 */
export const FOLDER_KINDS = ["models", "outputs", "wildcards"] as const;
export type FolderKind = (typeof FOLDER_KINDS)[number];

export const FolderId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Use a-z, 0-9 and dashes");

export const ProfileFolder = z.object({
  /** Unique within its kind; stays when the folder moves in the list. */
  id: FolderId,
  name: z.string().trim().min(1).max(60),
  path: z.string().trim().min(1),
});
export type ProfileFolder = z.infer<typeof ProfileFolder>;

const folderList = (kind: FolderKind) =>
  z.array(ProfileFolder).superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const f of list) {
      if (seen.has(f.id))
        ctx.addIssue({ code: "custom", message: `Two ${kind} folders use the id "${f.id}".` });
      seen.add(f.id);
    }
  });

export const ProfileFolders = z.object({
  models: folderList("models").default([]),
  outputs: folderList("outputs").default([]),
  wildcards: folderList("wildcards").default([]),
});
export type ProfileFolders = z.infer<typeof ProfileFolders>;

/** The main folder's path of a kind, or "" when the profile has none. */
export function mainFolder(profile: { folders: ProfileFolders }, kind: FolderKind): string {
  return profile.folders[kind][0]?.path ?? "";
}

/** A free folder id from a name ("SDXL LoRAs" → "sdxl-loras", then "sdxl-loras-2"…). */
export function folderIdFrom(name: string, taken: Iterable<string>, fallback = "folder"): string {
  const used = new Set(taken);
  const base = slugId(name, fallback);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** A folder's default name: its last path segment ("D:/AI/Output" → "Output"). */
export function folderNameOf(folderPath: string, fallback: string): string {
  return folderPath.split(/[\\/]/).filter(Boolean).pop()?.slice(0, 60) || fallback;
}

/** Main ids of folders made from the wizard's paths (and of version 1 profiles). */
export const MAIN_FOLDER_IDS: Record<FolderKind, string> = {
  models: "models",
  // The gallery's ratings, tags and collections point at this id (it was the outputs library).
  outputs: "outputs",
  wildcards: "wildcards",
};
const KIND_LABELS: Record<FolderKind, string> = {
  models: "Models",
  outputs: "Output",
  wildcards: "Wildcards",
};

/** Folders from the wizard's three paths: one main folder per kind that has a path. */
export function foldersFromPaths(paths: ProfilePaths): ProfileFolders {
  const out: ProfileFolders = { models: [], outputs: [], wildcards: [] };
  for (const kind of FOLDER_KINDS) {
    const p = paths[kind].trim();
    if (p)
      out[kind].push({
        id: MAIN_FOLDER_IDS[kind],
        name: folderNameOf(p, KIND_LABELS[kind]),
        path: p,
      });
  }
  return out;
}

/**
 * profile.json of version 1 (`paths`) → version 2 (`folders`). The gallery's extra libraries
 * (version 1 settings.json, `gallery.libraries`) become the secondary output folders, keeping
 * their ids so ratings, tags and collections still find their images. Newer files pass through.
 */
export function migrateProfile(raw: unknown, libraries: unknown = []): unknown {
  if (!raw || typeof raw !== "object" || "folders" in raw) return raw;
  const { paths, ...rest } = raw as { paths?: unknown };
  const folders = foldersFromPaths(ProfilePaths.catch(ProfilePaths.parse({})).parse(paths ?? {}));
  const taken = new Set(folders.outputs.map((f) => f.id));
  for (const lib of Array.isArray(libraries) ? libraries : []) {
    const parsed = ProfileFolder.safeParse(lib);
    if (!parsed.success || taken.has(parsed.data.id)) continue;
    taken.add(parsed.data.id);
    folders.outputs.push(parsed.data);
  }
  return { ...rest, version: 2, folders };
}

export const ComfyTarget = z.discriminatedUnion("mode", [
  /** Managed install under runtime/comfyui/<slot>/. */
  z.object({ mode: z.literal("managed"), slot: z.string().default("latest") }),
  /** A ComfyUI the user runs themselves. */
  z.object({ mode: z.literal("external"), url: z.string().url() }),
  /** A ComfyUI folder the user picked; Blombo starts it like a managed slot. */
  z.object({ mode: z.literal("local"), dir: z.string().trim().min(1) }),
]);
export type ComfyTarget = z.infer<typeof ComfyTarget>;

export const Profile = z.object({
  /** profile.json format version; `migrateProfile` brings older files up to it. */
  version: z.literal(2).default(2),
  id: ProfileId,
  name: z.string().trim().min(1).max(40),
  accent: z.enum(ACCENTS).default("blue"),
  theme: z.enum(THEMES).default("blombo"),
  hasAvatar: z.boolean().default(false),
  /** When the picture last changed; versions its URL so a new one shows at once. */
  avatarAt: z.string().nullable().default(null),
  folders: ProfileFolders.prefault({}),
  comfy: ComfyTarget.default({ mode: "managed", slot: "latest" }),
  createdAt: z.string(),
  lastOpenedAt: z.string().nullable().default(null),
});
export type Profile = z.infer<typeof Profile>;

/**
 * A profile's numbers for the profile screen (`GET /api/profiles/stats`), read from its database
 * without changing it; a profile that was never opened has zeros.
 */
export const ProfileStats = z.object({
  /** Images in the gallery index. */
  images: z.number().int().nonnegative(),
  favorites: z.number().int().nonnegative(),
  /** Runs in the job log (finished, stopped or failed). */
  runs: z.number().int().nonnegative(),
});
export type ProfileStats = z.infer<typeof ProfileStats>;

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
  /** A kind that's sent replaces that kind's whole list (order included: first is main). */
  folders: z
    .object({
      models: folderList("models"),
      outputs: folderList("outputs"),
      wildcards: folderList("wildcards"),
    })
    .partial()
    .optional(),
  comfy: ComfyTarget.optional(),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

export const ReorderProfilesBody = z.object({ order: z.array(ProfileId) });
export const OpenOnLaunchBody = z.object({ id: ProfileId.nullable() });

export const CheckPathBody = z.object({ path: z.string() });
/** The OS folder and image pickers (Settings, libraries, batch inputs). */
export const PickFolderBody = z.object({
  title: z.string().max(120).default("Choose a folder"),
  initial: z.string().optional(),
});
export type PickFolderBody = z.input<typeof PickFolderBody>;
export const PickImagesBody = z.object({ title: z.string().max(120).default("Choose images") });
export type PickImagesBody = z.input<typeof PickImagesBody>;
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

/**
 * data/profiles/<id>/secrets.json: the profile's Civitai API key. Kept apart from profile.json so
 * copying or sharing a profile's settings never carries it, and never sent to the client (the
 * API answers only whether a key is set, with its last four characters).
 */
export const ProfileSecrets = z.object({
  version: z.literal(1).default(1),
  civitai: z
    .object({
      key: z.string().nullable().default(null),
      /** The Civitai user the key belongs to, from the last check. */
      username: z.string().nullable().default(null),
      checkedAt: z.string().nullable().default(null),
    })
    .prefault({}),
});
export type ProfileSecrets = z.infer<typeof ProfileSecrets>;
