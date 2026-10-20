/**
 * Gallery UI state: which list is shown (library, favorites, this week, trash), the search and
 * filters, and the open lightbox image. Layout and tile size live in the profile's settings.
 */
import type { GALLERY_SORTS, GalleryQueryInput } from "@shared/gallery";
import { create } from "zustand";

export type GallerySort = (typeof GALLERY_SORTS)[number];

export interface GalleryUi {
  /** "all" or a library id. */
  library: string;
  view: "images" | "trash";
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
  /** Lightbox image id. */
  open: number | null;
  set: (patch: Partial<Omit<GalleryUi, "set" | "reset">>) => void;
  /** Back to everything, newest first. */
  reset: () => void;
}

const DEFAULTS = {
  library: "all",
  view: "images" as const,
  favorites: false,
  since: null,
  q: "",
  model: null,
  lora: null,
  rating: 0,
  tag: null,
  collection: null,
  sort: "newest" as const,
};

export const useGalleryUi = create<GalleryUi>((set) => ({
  ...DEFAULTS,
  open: null,
  set: (patch) => set(patch),
  reset: () => set({ ...DEFAULTS }),
}));

/** The server query for the current UI state (the search text is passed in debounced). */
export function galleryQuery(
  s: Pick<
    GalleryUi,
    "library" | "favorites" | "since" | "model" | "lora" | "sort" | "rating" | "tag" | "collection"
  >,
  q: string,
): GalleryQueryInput {
  const out: GalleryQueryInput = { library: s.library, sort: s.sort };
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

/** True when the list shows everything newest first (the showcase view). */
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
  >,
): boolean {
  return (
    s.library === "all" &&
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
