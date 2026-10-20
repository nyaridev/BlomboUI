/**
 * Profile settings (ADR-0006): data/profiles/<id>/settings.json. One Zod field with a default
 * per setting, so a missing or older file always parses into a complete object. Theme and accent
 * stay on the profile record (the profile screen needs them before settings load).
 *
 * Sections use `.prefault({})` so their inner defaults apply when a section is missing; Zod 4's
 * `.default()` would return the literal object without filling it.
 */
import { z } from "zod";
import { BrowseFilter, SavedFilter } from "./civitai.ts";

export const SETTINGS_VERSION = 1;

/** UI fonts. Geist and Inter are bundled; the others come from the computer. */
export const UI_FONTS = ["geist", "inter", "segoe", "system", "custom"] as const;
export type UiFont = (typeof UI_FONTS)[number];

export const UI_FONT_LABELS: Record<UiFont, string> = {
  geist: "Geist",
  inter: "Inter",
  segoe: "Segoe UI",
  system: "System default",
  custom: "Other font",
};

export const GALLERY_LAYOUTS = ["justified", "grid"] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

export const LibraryId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Invalid library id");

/** An extra folder shown in the gallery next to the outputs folder. */
export const LibraryEntry = z.object({
  id: LibraryId,
  name: z.string().trim().min(1).max(60),
  path: z.string().trim().min(1),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;

/** Animation: everything, fades only, or whatever Windows says (reduce animations). */
export const MOTION_PREFS = ["full", "reduced", "system"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

export const AppearanceSettings = z.object({
  font: z.enum(UI_FONTS).default("geist"),
  /** Family name for the "custom" choice, as installed on this computer. */
  customFont: z.string().trim().max(80).default(""),
  motion: z.enum(MOTION_PREFS).default("system"),
});

export const GallerySettings = z.object({
  layout: z.enum(GALLERY_LAYOUTS).default("justified"),
  /** Target row height (justified) or tile width (grid), in CSS pixels. */
  tileSize: z.number().int().min(120).max(400).default(220),
  libraries: z.array(LibraryEntry).default([]),
});

export const ModelSettings = z.object({
  /** Blur thumbnails marked NSFW until clicked (the owner's default). */
  blurNsfw: z.boolean().default(true),
});

export const GenerateSettings = z.object({
  /** The layout workflows show when they don't link one (a built-in or profile layout id). */
  layout: z.string().min(1).max(80).default("default"),
});

/** Ctrl+↑/↓ in the prompt editor changes weights by this much. */
export const WEIGHT_STEPS = [0.01, 0.05, 0.1] as const;

export const AutocompleteSettings = z.object({
  enabled: z.boolean().default(true),
  /** What suggestions draw from. */
  sources: z
    .object({
      tags: z.boolean().default(true),
      loras: z.boolean().default(true),
      triggers: z.boolean().default(true),
      wildcards: z.boolean().default(true),
      frequent: z.boolean().default(true),
    })
    .prefault({}),
  /** Tag lists turned off ("bundled:starter", "profile:danbooru.csv"). */
  disabledLists: z.array(z.string().max(200)).max(100).default([]),
  /** Characters typed before suggestions appear. */
  minChars: z.number().int().min(1).max(5).default(2),
  maxResults: z.number().int().min(5).max(50).default(15),
  /** "long_hair" goes in as "long hair". */
  replaceUnderscores: z.boolean().default(true),
  /** "name (artist)" goes in as "name \(artist\)", so parentheses aren't read as weights. */
  escapeParens: z.boolean().default(true),
  /** Add ", " after an inserted tag. */
  appendComma: z.boolean().default(true),
  /** Inserting a LoRA also inserts its trigger words. */
  insertTriggers: z.boolean().default(false),
  thumbnails: z.boolean().default(true),
  weightStep: z.number().min(0.01).max(0.25).default(0.05),
});
export type AutocompleteSettings = z.infer<typeof AutocompleteSettings>;

/** Parts of the folder a Civitai download is sorted into, in order ("Illustrious/Creator"). */
export const DOWNLOAD_FOLDER_PARTS = ["baseModel", "category", "creator"] as const;
export type DownloadFolderPart = (typeof DOWNLOAD_FOLDER_PARTS)[number];

export const DOWNLOAD_FOLDER_LABELS: Record<DownloadFolderPart, string> = {
  baseModel: "Base model",
  category: "Category",
  creator: "Creator",
};

/** How a downloaded file is named: Civitai's file name, or built from the model's name. */
export const DOWNLOAD_NAMING = ["original", "model", "model-version"] as const;
export type DownloadNaming = (typeof DOWNLOAD_NAMING)[number];

/** A creator's folder name: "some_user_123" → "Some User". */
export const AuthorAlias = z.object({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
});
export type AuthorAlias = z.infer<typeof AuthorAlias>;

export const CivitaiSettings = z.object({
  /** What the Civitai browser starts with. */
  browse: BrowseFilter.omit({ query: true, username: true }).prefault({}),
  downloads: z
    .object({
      /** Files downloading at the same time. */
      parallel: z.number().int().min(1).max(4).default(2),
      /** Subfolders inside the kind folder, in order. Empty: straight into loras/, checkpoints/… */
      folderBy: z.array(z.enum(DOWNLOAD_FOLDER_PARTS)).max(3).default(["baseModel"]),
      naming: z.enum(DOWNLOAD_NAMING).default("original"),
      aliases: z.array(AuthorAlias).max(200).default([]),
      /** Save Civitai's info (.civitai.info) next to the model. */
      saveInfo: z.boolean().default(true),
      /** Save the first image as the model's preview (.preview.png). */
      savePreview: z.boolean().default(true),
    })
    .prefault({}),
  /** Show "Installed" marks on Civitai models you already have. */
  marks: z.boolean().default(true),
  /** Hash local models in the background and look them up on Civitai (thumbnails, trigger words). */
  lookup: z.boolean().default(true),
  history: z
    .object({
      downloads: z.number().int().min(20).max(5000).default(500),
      views: z.number().int().min(20).max(2000).default(200),
      searches: z.number().int().min(0).max(100).default(20),
    })
    .prefault({}),
  savedFilters: z.array(SavedFilter).max(50).default([]),
});
export type CivitaiSettings = z.infer<typeof CivitaiSettings>;

/** OS notifications when something long finishes while Blombo is in the background. */
export const NotificationSettings = z.object({
  enabled: z.boolean().default(true),
  /** A run (or the queue) that took at least `minSeconds`. */
  jobs: z.boolean().default(true),
  /** A script or batch finished. */
  batches: z.boolean().default(true),
  downloads: z.boolean().default(true),
  minSeconds: z.number().int().min(0).max(3600).default(20),
});
export type NotificationSettings = z.infer<typeof NotificationSettings>;

/**
 * Shortcut overrides (shared/shortcuts.ts): an action and its key combo ("Ctrl+Shift+G"), or ""
 * for none. Actions not listed keep their default. A list, so a patch replaces it whole (a
 * reset removes an entry, which merging a record couldn't).
 */
export const ShortcutSettings = z.object({
  overrides: z
    .array(z.object({ action: z.string().min(1).max(60), keys: z.string().max(40) }))
    .max(200)
    .default([]),
});

export const HelpSettings = z.object({
  /** The Generate screen's first-run tour was finished or skipped. */
  tourDone: z.boolean().default(false),
});

export const Settings = z.object({
  version: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  appearance: AppearanceSettings.prefault({}),
  gallery: GallerySettings.prefault({}),
  models: ModelSettings.prefault({}),
  civitai: CivitaiSettings.prefault({}),
  generate: GenerateSettings.prefault({}),
  autocomplete: AutocompleteSettings.prefault({}),
  notifications: NotificationSettings.prefault({}),
  shortcuts: ShortcutSettings.prefault({}),
  help: HelpSettings.prefault({}),
});
export type Settings = z.infer<typeof Settings>;

/**
 * A partial update: each section is merged into the saved one and the result is validated as
 * a whole. Sections are loose records here on purpose; a `.partial()` of the real sections
 * would fill in defaults and overwrite saved values.
 */
const Section = z.record(z.string(), z.unknown());
export const SettingsPatch = z
  .object({
    appearance: Section,
    gallery: Section,
    models: Section,
    civitai: Section,
    generate: Section,
    autocomplete: Section,
    notifications: Section,
    shortcuts: Section,
    help: Section,
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/** Bring a settings.json of any known version up to the current one. */
export function migrateSettings(raw: unknown): Settings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Version 1 is the first format; later versions add steps here, oldest first.
  return Settings.parse({ ...input, version: SETTINGS_VERSION });
}

export interface ReadSettings {
  settings: Settings;
  /** Values that weren't valid and were replaced by their defaults ("gallery.tileSize"). */
  dropped: string[];
  /** The file was written by a newer BlomboUI (its version is higher than this one knows). */
  newer: boolean;
}

/**
 * Read a settings.json as well as possible: an invalid value falls back to its own default
 * (not the whole file's), and a file from a newer version is read the same way but flagged so
 * it's never written over with what this version understands.
 */
export function readSettings(raw: unknown): ReadSettings {
  const input = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  const version = Number(input.version);
  const newer = Number.isFinite(version) && version > SETTINGS_VERSION;
  const dropped: string[] = [];
  // Each bad value is removed where Zod points (array items as a whole, at their index), and
  // parsing is tried again; a value whose path can't be removed drops its whole section.
  for (let attempt = 0; attempt < 200; attempt++) {
    const parsed = Settings.safeParse({ ...input, version: SETTINGS_VERSION });
    if (parsed.success) return { settings: parsed.data, dropped, newer };
    const where = (parsed.error.issues[0]?.path ?? []).map(String);
    const section = where[0];
    if (!section || !removeAt(input, where)) {
      if (section && section in input) {
        delete input[section];
        dropped.push(section);
        continue;
      }
      break;
    }
    dropped.push(where.join("."));
  }
  return { settings: Settings.parse({}), dropped: [...dropped, "*"], newer };
}

/** Delete the value at `path` (stopping at the first array item); false when nothing's there. */
function removeAt(root: Record<string, unknown>, path: string[]): boolean {
  let node: unknown = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i] as string;
    if (Array.isArray(node)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return false;
      node.splice(index, 1);
      return true;
    }
    if (!isPlain(node) || !(key in node)) return false;
    if (i === path.length - 1) {
      delete node[key];
      return true;
    }
    const child = node[key];
    // Copy on the way down so the caller's parsed JSON isn't changed under it.
    node[key] = Array.isArray(child) ? [...child] : isPlain(child) ? { ...child } : child;
    node = node[key];
  }
  return false;
}

/**
 * Apply a patch: plain objects merge key by key at every depth (so a patch of
 * `{ civitai: { browse: { sort } } }` keeps the other browse values); arrays and values replace.
 */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return Settings.parse(deepMerge(current, patch));
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
  return out as T;
}

/** A readable id from a name ("My Renders" → "my-renders"). */
export function slugId(name: string, fallback: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

/** CSS font-family for a font choice (the token `--font-ui` takes this value). */
export function fontStack(font: UiFont, custom: string): string | null {
  if (font !== "custom") return null;
  const name = custom.replace(/["\\;{}<>]/g, "").trim();
  return name ? `"${name}", "Geist Variable", "Segoe UI", system-ui, sans-serif` : null;
}
