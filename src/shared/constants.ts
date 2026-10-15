/**
 * Shared vocabulary. Anything both the server and the client need to agree on by name
 * (ports, themes, accents, model kinds, views) is declared once here.
 */

export const APP_NAME = "BlomboUI";

/** Production server, dev API and dev Vite ports. ComfyUI is configured per profile. */
export const PORTS = {
  server: 4380,
  devServer: 4381,
  devWeb: 4382,
  comfy: 8188,
} as const;

export const THEMES = ["blombo", "slate", "midnight", "ember", "moss", "light"] as const;
export type ThemeId = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemeId, string> = {
  blombo: "Blombo",
  slate: "Slate",
  midnight: "Midnight",
  ember: "Ember",
  moss: "Moss",
  light: "Light",
};

/** Profile accent colors. Each maps to a palette family in tokens.css (`--<name>` / `--<name>-ink`). */
export const ACCENTS = [
  "blue",
  "purple",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
] as const;
export type AccentId = (typeof ACCENTS)[number];

export const MODEL_KINDS = [
  "checkpoints",
  "diffusion_models",
  "loras",
  "vae",
  "text_encoders",
  "upscale_models",
  "controlnet",
  "embeddings",
  "sams",
  "ultralytics",
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

/** Main views reachable from the header. Order is the default tab order. */
export const MAIN_VIEWS = ["generate", "gallery", "models", "wildcards", "file-info"] as const;
export type MainView = (typeof MAIN_VIEWS)[number];

/** Views reached from the avatar menu rather than the header tabs. */
export const MENU_VIEWS = ["settings", "history", "errors", "scopes", "help", "lab"] as const;
export type MenuView = (typeof MENU_VIEWS)[number];

export type ViewId = MainView | MenuView;
