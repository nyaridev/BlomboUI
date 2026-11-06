/**
 * Profile settings (ADR-0006): data/profiles/<id>/settings.json. One Zod field with a default
 * per setting, so a missing or older file always parses into a complete object. Theme and accent
 * stay on the profile record (the profile screen needs them before settings load).
 *
 * Sections use `.prefault({})` so their inner defaults apply when a section is missing; Zod 4's
 * `.default()` would return the literal object without filling it.
 */
import { z } from "zod";
import { BrowseFilter, CIVITAI_SITES, FollowedCreator, SavedFilter } from "./civitai.ts";
import { MAIN_VIEWS, type MainView, WORK_TABS, type WorkTab } from "./constants.ts";
import { salvage } from "./salvage.ts";
import { pathPattern } from "./savepaths.ts";
import { SET_RESOLUTIONS, SIZE_MODES } from "./sizes.ts";

export const SETTINGS_VERSION = 2;

/** UI fonts. Geist and Inter are bundled; the others come from the computer. */
export const UI_FONTS = ["geist", "inter", "segoe", "system", "custom"] as const;
export type UiFont = (typeof UI_FONTS)[number];
export const DEFAULT_UI_FONT: UiFont = "segoe";

export const UI_FONT_LABELS: Record<UiFont, string> = {
  geist: "Geist",
  inter: "Inter",
  segoe: "Segoe UI",
  system: "System default",
  custom: "Other font",
};

export const GALLERY_LAYOUTS = ["justified", "grid"] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];

/** Animation: everything, fades only, or whatever Windows says (reduce animations). */
export const MOTION_PREFS = ["full", "reduced", "system"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

/** Times of day: like Windows' clock, or always 24-hour or AM/PM. */
export const CLOCK_PREFS = ["system", "24h", "12h"] as const;
export type ClockPref = (typeof CLOCK_PREFS)[number];

export const AppearanceSettings = z.object({
  font: z.enum(UI_FONTS).default(DEFAULT_UI_FONT),
  /** Family name for the "custom" choice, as installed on this computer. */
  customFont: z.string().trim().max(80).default(""),
  motion: z.enum(MOTION_PREFS).default("system"),
  /** Stronger text, borders and fields in every theme (images stay as they are). */
  contrast: z.boolean().default(false),
  clock: z.enum(CLOCK_PREFS).default("system"),
});

/** The header's tab labels: hidden on narrow windows, always shown, or icons only. */
export const HEADER_LABELS = ["auto", "always", "icons"] as const;
export type HeaderLabels = (typeof HEADER_LABELS)[number];

/** Where a profile opens: where it was left, or always one view. */
export const START_VIEWS = ["last", ...MAIN_VIEWS] as const;
export type StartView = (typeof START_VIEWS)[number];

/** Card sizes are a share of the built-in size (1: as designed). */
const CardScale = z.number().min(0.6).max(1.6).default(1);

/**
 * How the app is arranged: which header and Generate tabs show and in what order, what the
 * number keys follow, card sizes and where a profile opens.
 */
export const UiSettings = z.object({
  headerOrder: z
    .array(z.enum(MAIN_VIEWS))
    .max(MAIN_VIEWS.length)
    .default(() => [...MAIN_VIEWS]),
  headerHidden: z.array(z.enum(MAIN_VIEWS)).max(MAIN_VIEWS.length).default([]),
  generateTabOrder: z
    .array(z.enum(WORK_TABS))
    .max(WORK_TABS.length)
    .default(() => [...WORK_TABS]),
  generateTabHidden: z.array(z.enum(WORK_TABS)).max(WORK_TABS.length).default([]),
  /** Ctrl+1… and Alt+1… count only the tabs that show; off, a hidden tab keeps its number. */
  numberKeysSkipHidden: z.boolean().default(true),
  headerLabels: z.enum(HEADER_LABELS).default("auto"),
  /** Cards in Generate's model pickers. */
  pickerCardScale: CardScale,
  /** Cards in Models (Local, Civitai, Wildcards). */
  modelsCardScale: CardScale,
  startView: z.enum(START_VIEWS).default("generate"),
});
export type UiSettings = z.infer<typeof UiSettings>;

/**
 * Tabs in the saved order (unknown ones dropped, missing ones added where the default puts
 * them) and the ones that show. `keep` never hides; at least one tab always shows.
 */
export function arrangeTabs<T extends string>(
  all: readonly T[],
  order: readonly T[],
  hidden: readonly T[],
  keep: readonly T[] = [],
): { order: T[]; shown: T[] } {
  const known = order.filter((t, i) => all.includes(t) && order.indexOf(t) === i);
  // A missing tab goes right after the tab it follows by default.
  for (const [i, t] of all.entries()) {
    if (known.includes(t)) continue;
    const before = all.slice(0, i).findLast((b) => known.includes(b));
    known.splice(before ? known.indexOf(before) + 1 : 0, 0, t);
  }
  const shown = known.filter((t) => keep.includes(t) || !hidden.includes(t));
  return { order: known, shown: shown.length ? shown : known.slice(0, 1) };
}

/**
 * The tab number key `n` (1-based) opens: the nth tab that shows, or with `skipHidden` off the
 * nth in order, so numbers stay put and a hidden tab's number does nothing.
 */
export function tabForNumber<T extends string>(
  tabs: { order: T[]; shown: T[] },
  n: number,
  skipHidden: boolean,
): T | null {
  const tab = (skipHidden ? tabs.shown : tabs.order)[n - 1];
  return tab && tabs.shown.includes(tab) ? tab : null;
}

export function headerTabs(ui: UiSettings): { order: MainView[]; shown: MainView[] } {
  return arrangeTabs(MAIN_VIEWS, ui.headerOrder, ui.headerHidden);
}

export function generateTabs(ui: UiSettings): { order: WorkTab[]; shown: WorkTab[] } {
  return arrangeTabs(WORK_TABS, ui.generateTabOrder, ui.generateTabHidden, ["generation"]);
}

export const GallerySettings = z.object({
  layout: z.enum(GALLERY_LAYOUTS).default("justified"),
  /** Target row height (justified) or tile width (grid), in CSS pixels. */
  tileSize: z.number().int().min(120).max(400).default(220),
  /** Leave script grids out (files in a `grids` folder, or A1111's `*-grids`). */
  excludeGrids: z.boolean().default(true),
  /** Leave out images saved by a run that was stopped before it finished. */
  excludeInterrupted: z.boolean().default(true),
  /** Leave out the JPEG copies of large images (Settings → Saving). */
  excludeJpegCopies: z.boolean().default(true),
  /** Animated WebPs and GIFs play in their tiles; off, they play on hover or when opened. */
  autoplayAnimated: z.boolean().default(true),
  /** Videos play (muted) in their tiles; off, they play on hover or when opened. */
  autoplayVideo: z.boolean().default(false),
  /** Images a list loads at a time (more load as you scroll). */
  pageSize: z.number().int().min(100).max(1000).default(300),
  // The gallery's folders are the profile's output folders (ADR-0017); version 1 files kept
  // them here as `libraries`, which profile.json's migration reads once.
});

/**
 * When the image stage shows ComfyUI's preview while sampling: from step `after` (rounded up to
 * a multiple of `every`), then every `every` steps, plus the last step when `lastStep` is on.
 * With `waitFirstOnly`, the later runs of one click start on the interval without waiting.
 */
export const PreviewSettings = z.object({
  show: z.boolean().default(true),
  every: z.number().int().min(1).max(50).default(4),
  after: z.number().int().min(1).max(50).default(8),
  waitFirstOnly: z.boolean().default(true),
  lastStep: z.boolean().default(true),
});
export type PreviewSettings = z.infer<typeof PreviewSettings>;

export const GenerateSettings = z.object({
  /** The layout workflows show when they don't link one (a built-in or profile layout id). */
  layout: z.string().min(1).max(80).default("default"),
  preview: PreviewSettings.prefault({}),
  /** How much of the Generation tab's width the params take (the image gets the rest). */
  paramsShare: z.number().min(0.3).max(0.75).default(0.5),
  /** The models strip: big pictures with names on them, small pictures only, or text chips. */
  tiles: z.enum(["pictures", "compact", "text"]).default("pictures"),
  /** How the Size picker sets the size: width and height, aspect and megapixels, or a list. */
  sizeMode: z.enum(SIZE_MODES).default("set"),
  /** The Set mode's list, "WxH" with the long side first (turned vertical on Generate). */
  setResolutions: z
    .array(z.string().regex(/^\d{2,4}x\d{2,4}$/))
    .max(40)
    .default(() => [...SET_RESOLUTIONS]),
  /** Sampler and scheduler names left out of the pickers (a picked one still shows). */
  hiddenSamplers: z.array(z.string().max(120)).max(300).default([]),
  hiddenSchedulers: z.array(z.string().max(120)).max(300).default([]),
  /** The pickers list what the workflow uses first, even when the search or filters leave it out. */
  pickerShowLoaded: z.boolean().default(true),
  /** A rename in the pickers also updates full <lora:…> and __wildcard__ references in wildcard files. */
  renameRefs: z.boolean().default(true),
});

/** Formats Blombo can save images and grids in. */
export const IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/**
 * How generated images and grids are saved (Settings → Saving). ComfyUI saves PNGs; another
 * format is converted right after, keeping the generation data (shared/savepaths.ts for paths).
 */
export const SavingSettings = z.object({
  format: z.enum(IMAGE_FORMATS).default("png"),
  /** JPEG and WebP quality. */
  quality: z.number().int().min(50).max(100).default(95),
  /** A JPEG copy beside an image whose file is bigger than `overKb` (for sharing). */
  jpegCopy: z
    .object({
      enabled: z.boolean().default(true),
      overKb: z.number().int().min(256).max(65536).default(4096),
      quality: z.number().int().min(50).max(100).default(90),
    })
    .prefault({}),
  paths: z
    .object({
      images: pathPattern("images"),
      grids: pathPattern("grids"),
      interrupted: pathPattern("interrupted"),
      jpegCopies: pathPattern("jpegCopies"),
    })
    .prefault({}),
  grids: z
    .object({
      /** A grid of a click's images when it made more than one (batch size or count). */
      batch: z.boolean().default(true),
      /** Still make it, of the finished images, when the click was stopped or cancelled. */
      onCancel: z.boolean().default(true),
      /** Put a stopped run's images in it too. */
      includeInterrupted: z.boolean().default(false),
      /** Images per batch grid (more make several); laid out as square as they go. */
      maxImages: z.number().int().min(4).max(100).default(64),
      /** Format and quality of every grid (batch, matrix, XY). */
      format: z.enum(IMAGE_FORMATS).default("png"),
      quality: z.number().int().min(50).max(100).default(90),
    })
    .prefault({}),
});
export type SavingSettings = z.infer<typeof SavingSettings>;

/**
 * Model pictures (`<model>_data/thumb.*`, services/modelthumbs.ts): how big and in what format
 * the card picture is saved, whether the full-size original is kept beside it, and whether an
 * animated picture (GIF, animated WebP) stays animated (as WebP) or keeps its first frame.
 */
export const ModelSettings = z.object({
  pictures: z
    .object({
      megapixels: z.number().min(0.05).max(2).default(0.25),
      format: z.enum(IMAGE_FORMATS).default("jpeg"),
      quality: z.number().int().min(50).max(100).default(85),
      keepRaw: z.boolean().default(true),
      animated: z.boolean().default(true),
    })
    .prefault({}),
});
export type ModelSettings = z.infer<typeof ModelSettings>;
export type PictureSettings = ModelSettings["pictures"];

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
  /** Rows the suggestion list shows before it scrolls (up to 50 suggestions come back). */
  rows: z.number().int().min(3).max(20).default(8),
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
  /**
   * Frequent tags count only prompt parts of up to this many words: "dark blue hair" is a tag,
   * "she has blue eyes" a sentence that shouldn't be suggested back.
   */
  frequentMaxWords: z.number().int().min(1).max(10).default(3),
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

/** A creator's file-name prefix: "yeetah145" → "yth145" (made by `autoPrefix`, or your own). */
export const AuthorAlias = z.object({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(40),
});
export type AuthorAlias = z.infer<typeof AuthorAlias>;

export const CivitaiSettings = z.object({
  /** Which Civitai site searches, downloads and links use (`CIVITAI_SITE_URLS`). */
  site: z.enum(CIVITAI_SITES).default("com"),
  /** What the Civitai browser starts with. */
  browse: BrowseFilter.omit({
    query: true,
    username: true,
    publishedFrom: true,
    publishedTo: true,
  }).prefault({}),
  downloads: z
    .object({
      /** Files downloading at the same time. */
      parallel: z.number().int().min(1).max(4).default(2),
      /** Subfolders inside the kind folder, in order. Empty: straight into loras/, checkpoints/… */
      folderBy: z
        .array(z.enum(DOWNLOAD_FOLDER_PARTS))
        .max(3)
        .default(["baseModel", "category", "creator"]),
      naming: z.enum(DOWNLOAD_NAMING).default("model"),
      /** Start file names with the author's prefix ("yth145_Sakura Haruno.safetensors"). */
      prefix: z.boolean().default(true),
      /** Make a prefix for an author without one on their first download (kept in `aliases`). */
      autoAliases: z.boolean().default(true),
      /** Author → prefix, yours or made automatically. Prefixes are unique per profile. */
      aliases: z.array(AuthorAlias).max(5000).default([]),
      /** Save Civitai's info (.civitai.info) next to the model. */
      saveInfo: z.boolean().default(true),
      /** Save the first image as the model's picture (`<model>_data/thumb.jpg`). */
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
  /** Creators you follow (Models → Civitai → Following), in the order you followed them. */
  following: z.array(FollowedCreator).max(500).default([]),
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
  minSeconds: z.number().int().min(0).max(3600).default(30),
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
  ui: UiSettings.prefault({}),
  gallery: GallerySettings.prefault({}),
  civitai: CivitaiSettings.prefault({}),
  generate: GenerateSettings.prefault({}),
  saving: SavingSettings.prefault({}),
  models: ModelSettings.prefault({}),
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
    ui: Section,
    gallery: Section,
    civitai: Section,
    generate: Section,
    saving: Section,
    models: Section,
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
  return Settings.parse(upgrade(input));
}

/** The steps from an older file to the current version, oldest first. */
function upgrade(input: Record<string, unknown>): Record<string, unknown> {
  const version = Number(input.version) || 1;
  let out = input;
  // 2: the Civitai browser started on Month until All time became the default; files written
  // then kept Month whether or not it was picked.
  if (version < 2 && isPlain(out.civitai) && isPlain(out.civitai.browse)) {
    const browse = out.civitai.browse;
    if (browse.period === "Month")
      out = { ...out, civitai: { ...out.civitai, browse: { ...browse, period: "AllTime" } } };
  }
  return { ...out, version: SETTINGS_VERSION };
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
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const version = Number(input.version);
  const newer = Number.isFinite(version) && version > SETTINGS_VERSION;
  const { data, fixed } = salvage(Settings, upgrade(input));
  return { settings: data, dropped: fixed, newer };
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
