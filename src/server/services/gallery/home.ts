/**
 * The gallery's Home: a random handful of recent images, the newest ones, and what you've been
 * prompting with. Images come from the gallery index (following its shown-images settings);
 * tags from the prompts you ran (autocomplete's counts); models, LoRAs and wildcards from the
 * job log, each with the newest image the gallery has that used it.
 */
import { type GalleryHome, HOME_RECENT_DAYS, type HomeUse } from "../../../shared/gallery.ts";
import type { AutocompleteService } from "../autocomplete.ts";
import type { HistoryService } from "../history.ts";
import { modelLabel } from "../workflows/summary.ts";
import { type GalleryService, shuffleKey } from "./index.ts";

/** The carousel picks from this many newest images. */
const PICK_FROM = 400;
const PICKS = 16;
const RECENT = 24;
const USES = 12;
const TAGS = 30;

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
  const recent = db
    .prepare(`${select} WHERE 1 = 1${shown} ORDER BY i.mtime DESC, i.id DESC LIMIT ?`)
    .all(RECENT)
    .map(toImage);

  // The gallery names models and LoRAs by file name without folder or extension (modelLabel).
  const byModel = db.prepare(`${select} WHERE i.model = ?${shown} ORDER BY i.mtime DESC LIMIT 1`);
  const byLora = db.prepare(
    `${select} WHERE EXISTS (SELECT 1 FROM image_loras l WHERE l.image_id = i.id AND l.name = ?)${shown}
     ORDER BY i.mtime DESC LIMIT 1`,
  );
  const found = (query: typeof byModel) => (name: string) => {
    const label = modelLabel(name) ?? name;
    const row = query.get(label);
    return row ? { cover: toImage(row).thumb, filter: label } : { cover: null, filter: null };
  };
  const uses = (
    kind: "model" | "lora" | "wildcard",
    find: (name: string) => Pick<HomeUse, "cover" | "filter">,
  ): HomeUse[] => deps.history.usage(kind, since, USES).map((u) => ({ ...u, ...find(u.name) }));

  return {
    picks,
    recent,
    tags: {
      top: await deps.autocomplete.usedTags(TAGS),
      lately: await deps.autocomplete.usedTags(TAGS, since),
    },
    models: uses("model", found(byModel)),
    loras: uses("lora", found(byLora)),
    wildcards: uses("wildcard", () => ({ cover: null, filter: null })),
  };
}
