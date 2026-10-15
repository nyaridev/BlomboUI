/**
 * Profile settings (ADR-0006): data/profiles/<id>/settings.json. One Zod field with a default
 * per setting, so a missing or older file always parses into a complete object. Theme and accent
 * stay on the profile record (the profile screen needs them before settings load).
 *
 * Sections use `.prefault({})` so their inner defaults apply when a section is missing; Zod 4's
 * `.default()` would return the literal object without filling it.
 */
import { z } from "zod";

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

export const AppearanceSettings = z.object({
  font: z.enum(UI_FONTS).default("geist"),
  /** Family name for the "custom" choice, as installed on this computer. */
  customFont: z.string().trim().max(80).default(""),
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

export const Settings = z.object({
  version: z.literal(SETTINGS_VERSION).default(SETTINGS_VERSION),
  appearance: AppearanceSettings.prefault({}),
  gallery: GallerySettings.prefault({}),
  models: ModelSettings.prefault({}),
});
export type Settings = z.infer<typeof Settings>;

/**
 * A partial update: each section is merged into the saved one and the result is validated as
 * a whole. Sections are loose records here on purpose; a `.partial()` of the real sections
 * would fill in defaults and overwrite saved values.
 */
const Section = z.record(z.string(), z.unknown());
export const SettingsPatch = z
  .object({ appearance: Section, gallery: Section, models: Section })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/** Bring a settings.json of any known version up to the current one. */
export function migrateSettings(raw: unknown): Settings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Version 1 is the first format; later versions add steps here, oldest first.
  return Settings.parse({ ...input, version: SETTINGS_VERSION });
}

export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return Settings.parse({
    ...current,
    appearance: { ...current.appearance, ...patch.appearance },
    gallery: { ...current.gallery, ...patch.gallery },
    models: { ...current.models, ...patch.models },
  });
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
