/**
 * Gallery UI state: which page is shown (Home, a Most used view, an image list, the trash), which list (library,
 * favorites, this week, recent, shuffled), the search and filters, and the open lightbox image.
 * Layout and tile size live in the profile's settings.
 */
import type { GALLERY_SORTS, GalleryQueryInput, UseKind } from "@shared/gallery";
import { create } from "zustand";

export type GallerySort = (typeof GALLERY_SORTS)[number];

export interface GalleryUi {
  /** "all" or a library id. */
  library: string;
  view: GalleryScreen;
  /** The Most used view's kind. */
  uses: UseKind;
  favorites: boolean;
  /** Only images since this time (ms), for "This week". */
  since: number | null;
  q: string;
  model: string | null;
  lora: string | null;
  /** Only images with at least this many stars (0: any). */
  rating: number;
  /** One of your tags. */
  tag: string | null;
  /** A collection id (shown instead of a library). */
  collection: string | null;
  sort: GallerySort;
  /** The shuffle's order (sort `random`); a new one shuffles again. */
  seed: number;
  /** One continuous grid, without day sections (Recent). */
  flat: boolean;
  /** Lightbox image id. */
  open: number | null;
  /** Narrow screens: the sidebar is open as a Sheet. */
  drawer: boolean;
  set: (patch: Partial<Omit<GalleryUi, "set" | "reset" | "show">>) => void;
  /** Back to everything, newest first. */
  reset: () => void;
  /** An image list: everything newest first, then `patch` (closes the narrow-screen drawer). */
  show: (patch?: Partial<Omit<GalleryUi, "set" | "reset" | "show">>) => void;
}

export type GalleryScreen = "home" | "uses" | "images" | "trash";

export const newSeed = () => Math.floor(Math.random() * 2_000_000_000);

const DEFAULTS = {
  library: "all",
  view: "images" as GalleryScreen,
  favorites: false,
  since: null,
  q: "",
  model: null,
  lora: null,
  rating: 0,
  tag: null,
  collection: null,
  sort: "newest" as GallerySort,
  flat: false,
};

export const useGalleryUi = create<GalleryUi>((set) => ({
  ...DEFAULTS,
  view: "home",
  uses: "models",
  seed: newSeed(),
  open: null,
  drawer: false,
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULTS }),
  show: (patch) => set({ ...DEFAULTS, drawer: false, ...patch }),
}));

/** The server query for the current UI state (the search text is passed in debounced). */
export function galleryQuery(
  s: Pick<
    GalleryUi,
    | "library"
    | "favorites"
    | "since"
    | "model"
    | "lora"
    | "sort"
    | "seed"
    | "rating"
    | "tag"
    | "collection"
  >,
  q: string,
): GalleryQueryInput {
  const out: GalleryQueryInput = { library: s.library, sort: s.sort };
  if (s.sort === "random") out.seed = s.seed;
  if (s.rating) out.rating = s.rating;
  if (s.tag) out.tag = s.tag;
  if (s.collection) out.collection = s.collection;
  if (s.favorites) out.favorites = "1";
  if (s.since) out.since = s.since;
  if (q.trim()) out.q = q.trim();
  if (s.model) out.model = s.model;
  if (s.lora) out.lora = s.lora;
  return out;
}

/** True when the list shows everything newest first in day sections (the showcase view). */
export function isHomeView(
  s: Pick<
    GalleryUi,
    | "library"
    | "favorites"
    | "since"
    | "q"
    | "model"
    | "lora"
    | "sort"
    | "rating"
    | "tag"
    | "collection"
    | "flat"
  >,
): boolean {
  return (
    s.library === "all" &&
    !s.flat &&
    !s.rating &&
    !s.tag &&
    !s.collection &&
    !s.favorites &&
    !s.since &&
    !s.q.trim() &&
    !s.model &&
    !s.lora &&
    s.sort === "newest"
  );
}
