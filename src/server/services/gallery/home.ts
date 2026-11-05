/**
 * The gallery's Home and Most used views: a random handful of recent images, and what you've
 * been prompting with, each with its newest images. Models, LoRAs and wildcards come from the
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
/** Images per item (its card crossfades through them). */
const IMAGES = 6;

export interface HomeDeps {
  gallery: GalleryService;
  history: HistoryService;
  autocomplete: AutocompleteService;
}

const KIND = { models: "model", loras: "lora", wildcards: "wildcard" } as const;

/**
 * A kind's items with their newest images: lately first (Home) or most used first (a view).
 * `lately` keeps only tags used in the last `HOME_RECENT_DAYS`.
 */
async function uses(
  deps: HomeDeps,
  kind: UseKind,
  opts: { limit: number; by: "recent" | "count"; lately?: boolean },
): Promise<HomeUse[]> {
  const since = Date.now() - HOME_RECENT_DAYS * 24 * 3600 * 1000;
  const newest = async (q: GalleryQueryInput) => {
    const page = await deps.gallery.query(GalleryQuery.parse({ ...q, limit: IMAGES }));
    return { images: page.items.map((i) => i.thumb), total: page.total };
  };
  const out: HomeUse[] = [];
  if (kind === "tags") {
    for (const t of await deps.autocomplete.usedTags(opts.limit, opts.lately ? since : 0)) {
      // Tags are counted with underscores; prompts often use spaces.
      const filter = t.tag.replace(/_/g, " ");
      out.push({ name: t.tag, count: t.uses, recent: 0, ...(await newest({ q: filter })), filter });
    }
    return out;
  }
  for (const u of deps.history.usage(KIND[kind], since, opts.limit, opts.by)) {
    const use = { name: u.name, count: u.count, recent: u.recent };
    if (kind === "wildcards") {
      const images = deps.history.images("wildcard", u.name, IMAGES).map((i) => i.thumb);
      out.push({ ...use, total: u.images, images, filter: null });
      continue;
    }
    // The gallery names models and LoRAs by file name without folder or extension (modelLabel).
    const label = modelLabel(u.name) ?? u.name;
    const found = await newest(kind === "models" ? { model: label } : { lora: label });
    out.push({ ...use, ...found, filter: found.total ? label : null });
  }
  return out;
}

/** A Most used view: the kind's most used first. */
export function mostUsed(deps: HomeDeps, kind: UseKind): Promise<HomeUse[]> {
  return uses(deps, kind, { limit: VIEW, by: "count" });
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
  const row = { limit: ROW, by: "recent" } as const;
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
