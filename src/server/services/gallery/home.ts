/**
 * The gallery's Home: a random handful of recent images and what you've been prompting with,
 * each with its newest images. Models, LoRAs and wildcards come from the job log and tags from
 * the prompts you ran (autocomplete's counts); their images come from the gallery index (its
 * model and LoRA filters, a search for a tag) or, for a wildcard, the runs that used it. All of
 * it follows the gallery's shown-images settings.
 */
import {
  type GalleryHome,
  GalleryQuery,
  type GalleryQueryInput,
  HOME_RECENT_DAYS,
  type HomeUse,
} from "../../../shared/gallery.ts";
import type { AutocompleteService } from "../autocomplete.ts";
import type { HistoryService } from "../history.ts";
import { modelLabel } from "../workflows/summary.ts";
import { type GalleryService, shuffleKey } from "./index.ts";

/** The carousel picks from this many newest images. */
const PICK_FROM = 400;
const PICKS = 16;
const USES = 12;
const TAGS = 12;
/** Images per model, LoRA, wildcard or tag (its card crossfades through them). */
const IMAGES = 6;

export async function galleryHome(
  deps: {
    gallery: GalleryService;
    history: HistoryService;
    autocomplete: AutocompleteService;
  },
  seed: number,
): Promise<GalleryHome> {
  const { db, shown, select, toImage } = await deps.gallery.reader();
  const since = Date.now() - HOME_RECENT_DAYS * 24 * 3600 * 1000;
  const picks = db
    .prepare(
      `SELECT * FROM (${select} WHERE 1 = 1${shown} ORDER BY i.mtime DESC LIMIT ?) i
       ORDER BY ${shuffleKey(seed)}, i.id LIMIT ?`,
    )
    .all(PICK_FROM, PICKS)
    .map(toImage);

  const newest = async (q: GalleryQueryInput) =>
    (await deps.gallery.query(GalleryQuery.parse({ ...q, limit: IMAGES }))).items.map(
      (i) => i.thumb,
    );
  // The gallery names models and LoRAs by file name without folder or extension (modelLabel).
  const filtered = async (kind: "model" | "lora"): Promise<HomeUse[]> => {
    const out: HomeUse[] = [];
    for (const u of deps.history.usage(kind, since, USES)) {
      const label = modelLabel(u.name) ?? u.name;
      const images = await newest({ [kind]: label });
      out.push({ ...u, images, filter: images.length ? label : null });
    }
    return out;
  };
  const tags = async (list: Array<{ tag: string; uses: number }>) => {
    const out: GalleryHome["tags"]["top"] = [];
    for (const t of list) out.push({ ...t, images: await newest({ q: t.tag.replace(/_/g, " ") }) });
    return out;
  };

  return {
    picks,
    tags: {
      top: await tags(await deps.autocomplete.usedTags(TAGS)),
      lately: await tags(await deps.autocomplete.usedTags(TAGS, since)),
    },
    models: await filtered("model"),
    loras: await filtered("lora"),
    wildcards: deps.history.usage("wildcard", since, USES).map((u) => ({
      ...u,
      images: deps.history.images("wildcard", u.name, IMAGES).map((i) => i.thumb),
      filter: null,
    })),
  };
}
