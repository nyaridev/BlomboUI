/**
 * The gallery's Home and Most used views: a random handful of recent images, and what you've
 * been prompting with, each with a random handful of its images (seeded, so a refetch keeps
 * them; in one row or view, a card takes images the cards before it haven't, when it can). Models, LoRAs and wildcards come from the
 * job log and tags from the prompts you ran (autocomplete's counts); their images come from the
 * gallery index (its model and LoRA filters, a search for a tag) or, for a wildcard, the runs
 * that used it. All of it follows the gallery's shown-images settings.
 */
import {
  type GalleryHome,
  GalleryQuery,
  type GalleryQueryInput,
  HOME_RECENT_DAYS,
  type HomeUse,
  type UseKind,
} from "../../../shared/gallery.ts";
import { hashString, rng } from "../../../shared/random.ts";
import type { AutocompleteService } from "../autocomplete.ts";
import type { HistoryService } from "../history.ts";
import { modelLabel } from "../workflows/summary.ts";
import { type GalleryService, shuffleKey } from "./index.ts";

/** The carousel picks from this many newest images. */
const PICK_FROM = 400;
const PICKS = 16;
/** Home's rows, and a Most used view. */
const ROW = 12;
const VIEW = 48;
/** Images per item (its card crossfades through them), picked from a random handful. */
const IMAGES = 6;
const POOL = 30;

export interface HomeDeps {
  gallery: GalleryService;
  history: HistoryService;
  autocomplete: AutocompleteService;
}

const KIND = { models: "model", loras: "lora", wildcards: "wildcard" } as const;

/** The seed of one item's images: the list's seed mixed with its name. */
const itemSeed = (seed: number, name: string) => (hashString(name) + seed) % 2_000_000_000;

/** A copy in a seeded random order. */
export function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const random = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Up to `IMAGES` of a card's candidates (in their random order), the ones earlier cards in the
 * row used least first, so cards that share images (one model, its LoRA and its tags) still
 * show different ones side by side. The picture a card opens on counts extra, so no two cards
 * open on the same one while another is left.
 */
export function takeImages(candidates: string[], used: Map<string, number>): string[] {
  const out = candidates
    .map((t, i) => ({ t, i, n: used.get(t) ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .slice(0, IMAGES)
    .map((c) => c.t);
  for (const [i, t] of out.entries()) used.set(t, (used.get(t) ?? 0) + (i === 0 ? IMAGES : 1));
  return out;
}

/**
 * A kind's items with a random handful of their images: lately first (Home) or most used first
 * (a view). `lately` keeps only tags used in the last `HOME_RECENT_DAYS`.
 */
async function uses(
  deps: HomeDeps,
  kind: UseKind,
  opts: { limit: number; by: "recent" | "count"; lately?: boolean; seed: number },
): Promise<HomeUse[]> {
  const since = Date.now() - HOME_RECENT_DAYS * 24 * 3600 * 1000;
  const used = new Map<string, number>();
  const newest = async (q: GalleryQueryInput, name: string) => {
    const page = await deps.gallery.query(
      GalleryQuery.parse({ ...q, sort: "random", seed: itemSeed(opts.seed, name), limit: POOL }),
    );
    return {
      images: takeImages(
        page.items.map((i) => i.thumb),
        used,
      ),
      total: page.total,
    };
  };
  const out: HomeUse[] = [];
  if (kind === "tags") {
    for (const t of await deps.autocomplete.usedTags(opts.limit, opts.lately ? since : 0)) {
      // Tags are counted with underscores; prompts often use spaces.
      const filter = t.tag.replace(/_/g, " ");
      out.push({
        name: t.tag,
        count: t.uses,
        recent: 0,
        ...(await newest({ q: filter }, t.tag)),
        filter,
      });
    }
    return out;
  }
  for (const u of deps.history.usage(KIND[kind], since, opts.limit, opts.by)) {
    const use = { name: u.name, count: u.count, recent: u.recent };
    if (kind === "wildcards") {
      const recent = deps.history.images("wildcard", u.name, POOL).map((i) => i.thumb);
      const images = takeImages(shuffled(recent, itemSeed(opts.seed, u.name)), used);
      out.push({ ...use, total: u.images, images, filter: null });
      continue;
    }
    // The gallery names models and LoRAs by file name without folder or extension (modelLabel).
    const label = modelLabel(u.name) ?? u.name;
    const found = await newest(kind === "models" ? { model: label } : { lora: label }, u.name);
    out.push({ ...use, ...found, filter: found.total ? label : null });
  }
  return out;
}

/** A Most used view: the kind's most used first. */
export function mostUsed(deps: HomeDeps, kind: UseKind, seed: number): Promise<HomeUse[]> {
  return uses(deps, kind, { limit: VIEW, by: "count", seed });
}

export async function galleryHome(deps: HomeDeps, seed: number): Promise<GalleryHome> {
  const { db, shown, select, toImage } = await deps.gallery.reader();
  const picks = db
    .prepare(
      `SELECT * FROM (${select} WHERE 1 = 1${shown} ORDER BY i.mtime DESC LIMIT ?) i
       ORDER BY ${shuffleKey(seed)}, i.id LIMIT ?`,
    )
    .all(PICK_FROM, PICKS)
    .map(toImage);
  const row = { limit: ROW, by: "recent", seed } as const;
  return {
    picks,
    tags: {
      top: await uses(deps, "tags", row),
      lately: await uses(deps, "tags", { ...row, lately: true }),
    },
    models: await uses(deps, "models", row),
    loras: await uses(deps, "loras", row),
    wildcards: await uses(deps, "wildcards", row),
  };
}
