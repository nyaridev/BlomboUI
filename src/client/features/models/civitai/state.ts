/**
 * The Civitai browser's UI state: the applied filter (seeded from Settings → Civitai's browse
 * defaults the first time), which home tab shows (Browse or Following), the creator picked
 * there and the ones you're only looking at (each creator's name clicked anywhere: pinned at the
 * top of Following, newest first, until you follow, close or clear them, so Browse's search stays
 * as it was), the
 * opened model tabs, the last tab opened (its tab flashes), whether NSFW images are
 * blurred (this view only, on each time the app starts) and whether models you have are hidden. The filter, home and tabs are remembered
 * in this window (localStorage), so a reload or a restart comes back to them, except the time
 * period, which starts at the profile's default (All time unless Settings → Civitai says otherwise)
 * on Browse and Following alike. Server data stays in TanStack Query.
 */
import { BrowseFilter, type BrowseFilterInput } from "@shared/civitai";
import type { Settings } from "@shared/settings";
import { create } from "zustand";
import { useModelsNav } from "../nav";

export interface OpenTab {
  id: number;
  name: string;
  /** The version it opens on (the card's); the newest without one. */
  versionId?: number;
}

export type CivitaiHome = "browse" | "following";

interface CivitaiState {
  filter: BrowseFilter | null;
  tabs: OpenTab[];
  /** The model tab in front; null shows the home tab (`home`). */
  active: number | null;
  home: CivitaiHome;
  /** Following: one creator's models; null for everyone you follow. */
  creator: string | null;
  /** Creators you're looking at without following them, newest first (this session only). */
  visiting: string[];
  /** The tab opened last; `n` changes on every open, so its tab flashes again. */
  flash: { id: number; n: number } | null;
  /** NSFW images stay blurred until clicked (the NSFW button switches it for every image). */
  blur: boolean;
  toggleBlur: () => void;
  /** Leave out models with a version in the models folder (this session only). */
  hideLocal: boolean;
  toggleHideLocal: () => void;
  /**
   * Once per window, before the first search: the profile's defaults, or the saved filter with the
   * default period.
   */
  seed: (browse: Settings["civitai"]["browse"]) => void;
  setFilter: (patch: Partial<BrowseFilterInput>) => void;
  replaceFilter: (filter: BrowseFilter) => void;
  /**
   * Open a model's tab on a version (the card's; the newest without one); `background` adds it
   * without leaving what's in front (a middle click).
   */
  open: (id: number, name: string, background?: boolean, versionId?: number | null) => void;
  close: (id: number) => void;
  closeAll: () => void;
  show: (id: number | null) => void;
  showHome: (home: CivitaiHome) => void;
  pickCreator: (creator: string | null) => void;
  /**
   * Show a creator's models in Following, pinned at the top whether followed or not;
   * `background` (a middle click) only adds them to Looking at, staying where you are.
   */
  visit: (creator: string, background?: boolean) => void;
  /** Close one creator you were looking at (back to everyone if they were picked). */
  endVisit: (creator: string) => void;
  /** Close every creator you were looking at. */
  clearVisits: () => void;
}

const MAX_TABS = 12;
/** Civitai usernames don't care about case. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
let seeded = false;
const KEY = "blombo.civitai";

type Saved = Pick<CivitaiState, "filter" | "tabs" | "active" | "home">;

/** What was saved, as far as it's still valid: a bad filter is dropped, bad tabs are skipped. */
export function readSaved(raw: unknown): Saved {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const filter = BrowseFilter.safeParse(o.filter);
  const tabs = (Array.isArray(o.tabs) ? o.tabs : [])
    .filter(
      (t): t is OpenTab =>
        Number.isInteger(t?.id) && t.id > 0 && typeof t.name === "string" && t.name.length > 0,
    )
    .map((t) => ({
      id: t.id,
      name: t.name.slice(0, 200),
      ...(Number.isInteger(t.versionId) && (t.versionId as number) > 0
        ? { versionId: t.versionId }
        : {}),
    }))
    .slice(-MAX_TABS);
  const active = tabs.some((t) => t.id === o.active) ? (o.active as number) : null;
  const home = o.home === "following" ? "following" : "browse";
  return { filter: o.filter && filter.success ? filter.data : null, tabs, active, home };
}

function load(): Saved {
  try {
    return readSaved(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return readSaved({});
  }
}

export const useCivitai = create<CivitaiState>((set, get) => ({
  ...load(),
  creator: null,
  visiting: [],
  flash: null,
  blur: true,
  toggleBlur: () => set((s) => ({ blur: !s.blur })),
  hideLocal: false,
  toggleHideLocal: () => set((s) => ({ hideLocal: !s.hideLocal })),
  seed: (browse) => {
    if (seeded) return;
    seeded = true;
    const filter = get().filter;
    set({ filter: filter ? { ...filter, period: browse.period } : BrowseFilter.parse(browse) });
  },
  setFilter: (patch) =>
    set((s) => ({ filter: BrowseFilter.parse({ ...(s.filter ?? {}), ...patch }) })),
  replaceFilter: (filter) => set({ filter }),
  open: (id, name, background = false, versionId = null) =>
    set((s) => {
      const tab: OpenTab = versionId ? { id, name, versionId } : { id, name };
      const tabs = s.tabs.some((t) => t.id === id)
        ? s.tabs.map((t) => (t.id === id ? tab : t))
        : [...s.tabs, tab].slice(-MAX_TABS);
      const active = background ? s.active : id;
      return {
        tabs,
        active: tabs.some((t) => t.id === active) ? active : null,
        flash: { id, n: (s.flash?.n ?? 0) + 1 },
      };
    }),
  closeAll: () => set({ tabs: [], active: null }),
  close: (id) =>
    set((s) => {
      const at = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const active = s.active === id ? (tabs[Math.min(at, tabs.length - 1)]?.id ?? null) : s.active;
      return { tabs, active };
    }),
  show: (id) => set({ active: id }),
  showHome: (home) => set({ home, active: null }),
  pickCreator: (creator) => set({ creator }),
  visit: (creator, background = false) =>
    set((s) => {
      const visiting = [creator, ...s.visiting.filter((v) => !same(v, creator))];
      return background ? { visiting } : { visiting, creator, home: "following", active: null };
    }),
  endVisit: (creator) =>
    set((s) => ({
      visiting: s.visiting.filter((v) => !same(v, creator)),
      creator: s.creator && same(s.creator, creator) ? null : s.creator,
    })),
  clearVisits: () =>
    set((s) => ({
      visiting: [],
      creator: s.visiting.some((v) => same(v, s.creator ?? "")) ? null : s.creator,
    })),
}));

useCivitai.subscribe((s, prev) => {
  if (
    s.filter === prev.filter &&
    s.tabs === prev.tabs &&
    s.active === prev.active &&
    s.home === prev.home
  )
    return;
  try {
    const saved: Saved = { filter: s.filter, tabs: s.tabs, active: s.active, home: s.home };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage can be unavailable; the state still holds for this session.
  }
});

/** Open a Civitai model in its tab, from anywhere (switches Models to the Civitai tab). */
export function openCivitaiModel(id: number, name: string): void {
  useCivitai.getState().open(id, name);
  useModelsNav.getState().setTab("civitai");
}
