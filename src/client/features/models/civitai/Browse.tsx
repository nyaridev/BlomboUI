/**
 * Models → Civitai → Browse: a clear filter bar (saved filters, search with a creator (from a saved
 * filter) as a removable chip in front of the text, the NSFW blur, the types, category and base
 * model dropdowns (base models in family sections: shared/basemodels.ts), sort and a Filters
 * pop-up (the period as a segmented bar, a published-date range through Civitai's site search with the
 * API key, and Hide downloaded); what's listed follows the profile's Civitai site), recent searches, and the results
 * as one virtualized grid of ModelCards that loads the next page as you near the end. A card opens
 * its model (a middle click opens it behind), a double click asks to download it
 * (DownloadDialog). The Following tab reuses the filter bar and the results. Results come from
 * the server's cached proxy.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useElementWidth } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import {
  qk,
  useCivitaiAccount,
  type useCivitaiFeed,
  useCivitaiModels,
  useCivitaiSearches,
  useSettings,
  useUpdateSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  KIND_STYLE,
  ModelCard,
  MultiSelect,
  Popover,
  Segmented,
  Select,
  Skeleton,
  Switch,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import { BASE_MODEL_GROUPS } from "@shared/basemodels";
import {
  BrowseFilter,
  CIVITAI_CATEGORIES,
  CIVITAI_FILTER_TYPES,
  CIVITAI_PERIOD_LABELS,
  CIVITAI_PERIODS,
  CIVITAI_SORTS,
  CIVITAI_TYPE_LABELS,
  type CivitaiCard,
  type CivitaiSort,
  categoryLabel,
  civitaiKind,
  compactCount,
  completeDateRange,
  DATE_RANGE_DAYS,
  type SavedFilter,
} from "@shared/civitai";
import { shortBaseModel } from "@shared/models";
import { slugId } from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DownloadDialog } from "./DownloadDialog";
import { FollowButton } from "./follow";
import { cardMark, localVersions } from "./marks";
import { useCivitai } from "./state";

/** Six cards a row at most; fewer when a card would get thinner than MIN_CARD. */
const MAX_COLS = 6;
const MIN_CARD = 188;
/** How long a click waits to see if it's a double click (the download pop-up). */
const DOUBLE_CLICK_MS = 220;
const GAP = 12;
const FOOTER = 34;

export function Browse() {
  const filter = useCivitai((s) => s.filter);
  if (!filter) return <CardSkeletons count={10} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar filter={filter} />
      <BrowseResults filter={filter} />
    </div>
  );
}

/** Seed the filter from Settings → Civitai's browse defaults (once, before the first search). */
export function useSeedFilter() {
  const seed = useCivitai((s) => s.seed);
  const settings = useSettings().data;
  useEffect(() => {
    if (settings) seed(settings.civitai.browse);
  }, [settings, seed]);
}

export function CardSkeletons({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3 p-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4]" />
      ))}
    </div>
  );
}

/* ── filter bar ─────────────────────────────────────────────────────────── */

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories", icon: "tag" as IconName },
  ...CIVITAI_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
];

/** Every base model Civitai knows, in family sections, then its own "Other". */
const BASE_MODEL_OPTIONS = [
  { value: "any", label: "Any base model" },
  ...BASE_MODEL_GROUPS.flatMap((g) => g.names.map((n) => ({ value: n, label: n, group: g.title }))),
  { value: "Other", label: "Other", group: "Other" },
];

const SORT_ICONS: Record<CivitaiSort, IconName> = {
  "Highest Rated": "star",
  "Most Downloaded": "download",
  "Most Liked": "heart",
  "Most Discussed": "text",
  "Most Collected": "pin",
  "Most Images": "image",
  Newest: "clock",
  Oldest: "history",
};

/**
 * The filter bar. On Following (`following`: true, or the one creator shown there) the creator
 * comes from the tab's list and the order is newest first, so the creator chip, the sort and
 * recent searches are left out.
 */
export function FilterBar({
  filter,
  following,
}: {
  filter: BrowseFilter;
  following?: boolean | string;
}) {
  const setFilter = useCivitai((s) => s.setFilter);
  const replace = useCivitai((s) => s.replaceFilter);
  const settings = useSettings().data;
  const searches = useCivitaiSearches().data ?? [];
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [text, setText] = useState(filter.query);
  useEffect(() => setText(filter.query), [filter.query]);

  const search = (query: string) => setFilter({ query: query.trim() });
  const defaults = settings ? BrowseFilter.parse(settings.civitai.browse) : BrowseFilter.parse({});
  const creator = following ? "" : filter.username;
  const changed =
    JSON.stringify({ ...filter, query: "", username: "", tag: "" }) !== JSON.stringify(defaults) ||
    filter.query !== "" ||
    filter.tag !== "" ||
    creator !== "";

  return (
    <div className="flex flex-col gap-2.5 border-b border-line p-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(text);
        }}
      >
        <SavedFilters filter={filter} onApply={replace} />
        <TextField
          icon="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Backspace at the very start takes the creator out, as in a mail "To" field.
            const t = e.currentTarget;
            if (
              e.key === "Backspace" &&
              creator &&
              t.selectionStart === 0 &&
              t.selectionEnd === 0
            ) {
              e.preventDefault();
              setFilter({ username: "" });
            }
          }}
          onClear={() => {
            setText("");
            search("");
          }}
          leading={
            creator ? (
              <Chip
                size="sm"
                icon="user"
                selected
                onRemove={() => setFilter({ username: "" })}
                className="shrink-0"
              >
                {creator}
              </Chip>
            ) : null
          }
          trailing={creator ? <FollowButton name={creator} /> : null}
          className="flex-1"
          placeholder={
            creator || typeof following === "string"
              ? `Search ${creator || following}'s models`
              : following
                ? "Search the models of creators you follow"
                : "Search Civitai: model names, tags, creators"
          }
          aria-label="Search Civitai"
        />
        <Button variant="primary" type="submit" icon="search">
          Search
        </Button>
        <NsfwBlurToggle size="md" />
      </form>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1.5">
          <MultiSelect
            size="sm"
            label="Model types"
            clearLabel="All types"
            value={filter.types}
            onChange={(types) => setFilter({ types })}
            className="w-[150px] shrink-0"
            options={CIVITAI_FILTER_TYPES.map((t) => {
              const kind = civitaiKind(t);
              return {
                value: t,
                label: CIVITAI_TYPE_LABELS[t] ?? t,
                icon: kind ? KIND_STYLE[kind].icon : undefined,
              };
            })}
          />
          {/* One category at a time, as on Civitai's site; a tag from elsewhere shows as itself. */}
          <Select<string>
            size="sm"
            label="Category"
            value={filter.tag}
            onChange={(tag) => setFilter({ tag })}
            className="w-[150px] shrink-0"
            options={
              filter.tag && !CATEGORY_OPTIONS.some((o) => o.value === filter.tag)
                ? [...CATEGORY_OPTIONS, { value: filter.tag, label: categoryLabel(filter.tag) }]
                : CATEGORY_OPTIONS
            }
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Select<string>
            size="sm"
            label="Base model"
            value={filter.baseModels[0] ?? "any"}
            onChange={(v) => setFilter({ baseModels: v === "any" ? [] : [v] })}
            className="w-[190px]"
            options={
              filter.baseModels[0] &&
              !BASE_MODEL_OPTIONS.some((o) => o.value === filter.baseModels[0])
                ? [
                    ...BASE_MODEL_OPTIONS,
                    { value: filter.baseModels[0], label: filter.baseModels[0] },
                  ]
                : BASE_MODEL_OPTIONS
            }
          />
          {following ? (
            <span className="flex h-7 items-center gap-1.5 px-1 text-xs text-fg-3">
              <Icon name="clock" size={13} />
              Newest first
            </span>
          ) : (
            <Select
              size="sm"
              label="Sort"
              value={filter.sort}
              onChange={(sort) => setFilter({ sort })}
              className="w-[160px]"
              options={CIVITAI_SORTS.map((s) => ({ value: s, label: s, icon: SORT_ICONS[s] }))}
            />
          )}
          <MoreFilters filter={filter} defaultPeriod={defaults.period} />
          {changed ? (
            <Button
              size="sm"
              variant="ghost"
              icon="undo"
              // Following keeps Browse's creator: it isn't shown there.
              onClick={() =>
                replace(following ? { ...defaults, username: filter.username } : defaults)
              }
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>
      {searches.length && !following ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-3">Recent:</span>
          {searches.slice(0, 8).map((s) => (
            <Chip
              key={s.query}
              size="sm"
              icon="history"
              selected={s.query === filter.query}
              onClick={() => search(s.query)}
              onRemove={() =>
                void api
                  .forgetCivitaiSearch(s.query)
                  .then(() => qc.invalidateQueries({ queryKey: qk.civitaiSearches(profileId) }))
              }
            >
              {s.query}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SavedFilters({
  filter,
  onApply,
}: {
  filter: BrowseFilter;
  onApply: (f: BrowseFilter) => void;
}) {
  const saved = useSettings().data?.civitai.savedFilters ?? [];
  const update = useUpdateSettings();
  const [name, setName] = useState("");
  const save = (list: SavedFilter[]) =>
    update.mutate(
      { civitai: { savedFilters: list } },
      { onError: (e) => toast(e.message, "error") },
    );
  const suggest =
    filter.query ||
    [filter.types.map((t) => CIVITAI_TYPE_LABELS[t] ?? t).join(" + "), filter.baseModels[0]]
      .filter(Boolean)
      .join(" · ") ||
    "My filter";
  return (
    <Popover
      placement="bottom-start"
      className="w-80 p-0"
      trigger={
        <IconButton
          icon="star"
          variant="secondary"
          label={saved.length ? `Saved filters (${saved.length})` : "Saved filters"}
          active={saved.some((f) => JSON.stringify(f.filter) === JSON.stringify(filter))}
        />
      }
    >
      {(close) => (
        <div className="flex flex-col">
          <div className="flex max-h-72 flex-col overflow-y-auto p-1.5">
            {saved.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-fg-3">
                Save a filter you use often, then apply it with one click.
              </p>
            ) : (
              saved.map((f) => (
                <div key={f.id} className="group flex items-center gap-1 rounded-md hover:bg-field">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start px-2.5 py-1.5 text-left focus-ring"
                    onClick={() => {
                      onApply(f.filter);
                      close();
                    }}
                  >
                    <span className="truncate text-sm text-fg">{f.name}</span>
                    <span className="truncate text-2xs text-fg-3">{describe(f.filter)}</span>
                  </button>
                  <IconButton
                    icon="x"
                    label={`Remove "${f.name}"`}
                    size="xs"
                    className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100"
                    onClick={() => save(saved.filter((x) => x.id !== f.id))}
                  />
                </div>
              ))
            )}
          </div>
          <form
            className="flex gap-1.5 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const label = (name || suggest).trim().slice(0, 60);
              let id = slugId(label, "filter");
              for (let n = 2; saved.some((x) => x.id === id); n++)
                id = `${slugId(label, "filter")}-${n}`;
              save([...saved, { id, name: label, filter }]);
              setName("");
              toast(`Saved "${label}"`, "success");
            }}
          >
            <TextField
              size="sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggest}
              className="flex-1"
              aria-label="Name for this filter"
            />
            <Button size="sm" type="submit" icon="plus">
              Save
            </Button>
          </form>
        </div>
      )}
    </Popover>
  );
}

const UTC_DAY = (day: string, year: boolean) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  });

/** "Sep 1 – Sep 30" (with the year when it isn't this one), or null without a range. */
function rangeLabel(f: BrowseFilter): string | null {
  if (!f.publishedFrom || !f.publishedTo) return null;
  const year = !f.publishedTo.startsWith(String(new Date().getUTCFullYear()));
  return `${UTC_DAY(f.publishedFrom, year)} – ${UTC_DAY(f.publishedTo, year)}`;
}

/**
 * The Filters pop-up (as on Civitai's site): the period as chips, a published-date range on top
 * of it (Civitai's own site search: 31 days at most, with the API key; setting one day fills in
 * the other), and Hide downloaded. The button counts what differs from the profile's defaults.
 */
function MoreFilters({
  filter,
  defaultPeriod,
}: {
  filter: BrowseFilter;
  defaultPeriod: BrowseFilter["period"];
}) {
  const setFilter = useCivitai((s) => s.setFilter);
  const hideLocal = useCivitai((s) => s.hideLocal);
  const toggleHideLocal = useCivitai((s) => s.toggleHideLocal);
  const keySet = useCivitaiAccount().data?.keySet ?? true;
  const from = filter.publishedFrom;
  const to = filter.publishedTo;
  const setRange = (r: { from: string; to: string }) =>
    setFilter({ publishedFrom: r.from, publishedTo: r.to });
  const range = rangeLabel(filter);
  const on = (filter.period !== defaultPeriod ? 1 : 0) + (range ? 1 : 0) + (hideLocal ? 1 : 0);
  return (
    <Popover
      placement="bottom-end"
      className="w-[352px] p-0"
      trigger={
        <Button
          size="sm"
          variant="outline"
          icon="filter"
          className={cn(on > 0 && "border-accent-ink/60 text-fg")}
        >
          Filters
          {on ? (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent tabular">
              {on}
            </span>
          ) : null}
        </Button>
      }
    >
      {(close) => (
        <div className="flex flex-col">
          <section className="flex flex-col gap-2.5 p-3">
            <h3 className="label-caps">Time period</h3>
            <Segmented
              size="sm"
              full
              label="Time period"
              value={filter.period}
              onChange={(period) => setFilter({ period })}
              options={CIVITAI_PERIODS.map((p) => ({ value: p, label: CIVITAI_PERIOD_LABELS[p] }))}
            />
          </section>
          <section className="flex flex-col gap-2.5 border-t border-line p-3">
            <div className="flex items-center gap-2">
              <h3 className="label-caps">Published</h3>
              {range ? <span className="text-2xs text-fg-2">{range}</span> : null}
              {from || to ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="-my-1 ml-auto h-6 px-1.5 text-2xs"
                  onClick={() => setRange({ from: "", to: "" })}
                >
                  Any date
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-2xs text-fg-3">
                From
                <TextField
                  size="sm"
                  type="date"
                  value={from}
                  onChange={(e) => setRange(completeDateRange(e.target.value, to, "from"))}
                />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-fg-3">
                To
                <TextField
                  size="sm"
                  type="date"
                  value={to}
                  onChange={(e) => setRange(completeDateRange(from, e.target.value, "to"))}
                />
              </label>
            </div>
            <p className="text-2xs text-pretty text-fg-3">
              {DATE_RANGE_DAYS} days at most, both days counted (UTC), as Civitai allows. Picking
              one day fills in the other.
            </p>
            {keySet ? null : (
              <p className="flex gap-1.5 text-2xs text-pretty text-warning">
                <Icon name="info" size={12} className="mt-px shrink-0" />
                Searching by date uses Civitai's own search, which needs your API key. Add it in
                Settings → Civitai.
              </p>
            )}
          </section>
          <section className="flex flex-col gap-2.5 border-t border-line p-3">
            <h3 className="label-caps">Your models</h3>
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm text-fg">Hide downloaded</span>
                <span className="text-2xs text-pretty text-fg-3">
                  Leave out models with a version in your models folder.
                </span>
              </div>
              <Switch
                size="sm"
                label="Hide downloaded"
                checked={hideLocal}
                onCheckedChange={toggleHideLocal}
              />
            </div>
          </section>
          <footer className="flex items-center gap-2 border-t border-line px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              icon="undo"
              disabled={!on}
              onClick={() => {
                setFilter({ period: defaultPeriod, publishedFrom: "", publishedTo: "" });
                if (hideLocal) toggleHideLocal();
              }}
            >
              Clear filters
            </Button>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={close}>
              Done
            </Button>
          </footer>
        </div>
      )}
    </Popover>
  );
}

function describe(f: BrowseFilter): string {
  return [
    f.username ? `by ${f.username}` : null,
    f.query ? `"${f.query}"` : null,
    f.types.length ? f.types.map((t) => CIVITAI_TYPE_LABELS[t] ?? t).join(", ") : "All types",
    f.baseModels[0] ?? null,
    f.tag ? categoryLabel(f.tag) : null,
    f.sort,
    CIVITAI_PERIOD_LABELS[f.period],
    rangeLabel(f),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The Civitai view's NSFW button: blurs every NSFW image until clicked, or shows them all.
 * Switching it re-blurs the ones clicked open before. Not saved: it's on each time the app starts.
 */
export function NsfwBlurToggle({ size = "sm" }: { size?: "sm" | "md" }) {
  const blur = useCivitai((s) => s.blur);
  const toggle = useCivitai((s) => s.toggleBlur);
  return (
    <Tooltip
      content={
        blur
          ? "NSFW images are blurred until clicked. Click to show them all."
          : "NSFW images are shown. Click to blur them all again."
      }
    >
      <Chip size={size} icon={blur ? "eye-off" : "eye"} selected={blur} onClick={toggle}>
        NSFW
      </Chip>
    </Tooltip>
  );
}

/* ── results ────────────────────────────────────────────────────────────── */

function BrowseResults({ filter }: { filter: BrowseFilter }) {
  const q = useCivitaiModels(filter);
  const setFilter = useCivitai((s) => s.setFilter);
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  // The server remembers searches; show the new one in "Recent".
  const fresh = q.isSuccess && !q.isPlaceholderData;
  useEffect(() => {
    if (filter.query && fresh)
      void qc.invalidateQueries({ queryKey: qk.civitaiSearches(profileId) });
  }, [filter.query, fresh, qc, profileId]);
  return (
    <Results
      q={q}
      empty={
        <EmptyState
          icon="search"
          title="No models match"
          text="Try other words, fewer types, another category or another period."
          action={
            <Button
              onClick={() =>
                setFilter({
                  query: "",
                  types: [],
                  baseModels: [],
                  tag: "",
                  period: "AllTime",
                  publishedFrom: "",
                  publishedTo: "",
                })
              }
            >
              Search everything
            </Button>
          }
        />
      }
    />
  );
}

/** A page list from Civitai: the browser's search or the Following feed. */
type ModelsQuery = ReturnType<typeof useCivitaiModels> | ReturnType<typeof useCivitaiFeed>;

/** The results grid with its loading, error and empty states (Browse and Following). */
export function Results({ q, empty }: { q: ModelsQuery; empty: ReactNode }) {
  const open = useCivitai((s) => s.open);
  const [downloading, setDownloading] = useState<number | null>(null);
  const settings = useSettings().data;
  const blurNsfw = useCivitai((s) => s.blur);
  const showMarks = settings?.civitai.marks ?? true;
  const downloads = useLive((s) => s.downloads);
  const hideLocal = useCivitai((s) => s.hideLocal);
  const toggleHideLocal = useCivitai((s) => s.toggleHideLocal);

  const all = useMemo(() => {
    const seen = new Set<number>();
    const out: CivitaiCard[] = [];
    for (const page of q.data?.pages ?? [])
      for (const c of page.items)
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
    return out;
  }, [q.data]);
  const items = useMemo(
    () => (hideLocal ? all.filter((c) => localVersions(c.id, c.local, downloads).size === 0) : all),
    [all, hideLocal, downloads],
  );
  // Every model on the pages so far is downloaded: look further instead of showing nothing.
  const lookFurther =
    hideLocal && all.length > 0 && !items.length && q.hasNextPage && !q.isFetchNextPageError;
  useEffect(() => {
    if (lookFurther && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [lookFurther, q]);

  if (q.isLoading || lookFurther) return <CardSkeletons count={12} />;
  if (q.error && !items.length)
    return (
      <EmptyState
        icon="globe"
        tone="warning"
        title="Couldn't load Civitai"
        text={q.error.message}
        action={<Button onClick={() => void q.refetch()}>Try again</Button>}
      />
    );
  if (!items.length && all.length)
    return (
      <EmptyState
        icon="check-circle"
        title="You have all of these"
        text="Every model that matches is in your models folder already."
        action={<Button onClick={toggleHideLocal}>Show downloaded</Button>}
      />
    );
  if (!items.length) return empty;
  return (
    <>
      <Grid
        items={items}
        blurNsfw={blurNsfw}
        mark={(c) => cardMark(c, downloads, showMarks)}
        onOpen={(c, background) => open(c.id, c.name, background)}
        onDownload={(c) => setDownloading(c.id)}
        onEnd={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        loadingMore={q.isFetchingNextPage}
        fetching={q.isFetching && !q.isFetchingNextPage}
      />
      <DownloadDialog modelId={downloading} onClose={() => setDownloading(null)} />
    </>
  );
}

function Grid({
  items,
  blurNsfw,
  mark,
  onOpen,
  onDownload,
  onEnd,
  loadingMore,
  fetching,
}: {
  items: CivitaiCard[];
  blurNsfw: boolean;
  mark: (c: CivitaiCard) => ReturnType<typeof cardMark>;
  onOpen: (c: CivitaiCard, background: boolean) => void;
  /** A double click: the download pop-up. */
  onDownload: (c: CivitaiCard) => void;
  onEnd: () => void;
  loadingMore: boolean;
  fetching: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // A click opens the model a moment later, so a double click can ask to download instead.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(clickTimer.current ?? undefined), []);
  const click = (c: CivitaiCard) => {
    clearTimeout(clickTimer.current ?? undefined);
    clickTimer.current = setTimeout(() => onOpen(c, false), DOUBLE_CLICK_MS);
  };
  const doubleClick = (c: CivitaiCard) => {
    clearTimeout(clickTimer.current ?? undefined);
    onDownload(c);
  };
  const width = useElementWidth(innerRef);
  const cols = Math.min(MAX_COLS, Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP))));
  const cardW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_CARD;
  const rowH = Math.round((cardW * 4) / 3) + FOOTER + GAP;
  const rows = Math.ceil(items.length / cols);
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
  });
  useEffect(() => {
    if (rowH > 0) virtualizer.measure();
  }, [rowH, virtualizer]);
  const visible = virtualizer.getVirtualItems();
  const last = visible[visible.length - 1]?.index ?? 0;
  // Near the end: ask for the next page.
  useEffect(() => {
    if (rows > 0 && last >= rows - 3) onEnd();
  }, [last, rows, onEnd]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "scroll-quiet min-h-0 flex-1 overflow-y-auto p-3 transition-opacity",
        fetching && "opacity-60",
      )}
    >
      <div
        ref={innerRef}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {visible.map((v) => (
          <div
            key={v.key}
            className="absolute inset-x-0 top-0 grid"
            style={{
              transform: `translateY(${v.start}px)`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {items.slice(v.index * cols, v.index * cols + cols).map((c) => (
              <ModelCard
                key={c.id}
                name={c.name}
                kind={c.kind ?? "checkpoints"}
                baseModel={shortBaseModel(c.baseModel) ?? undefined}
                thumb={c.image?.thumb ?? null}
                nsfw={c.image?.nsfw || c.nsfw}
                blurNsfw={blurNsfw}
                mark={mark(c)}
                typeLabel={CIVITAI_TYPE_LABELS[c.type] ?? c.type}
                onClick={() => click(c)}
                onDoubleClick={() => doubleClick(c)}
                onMiddleClick={() => onOpen(c, true)}
                footer={
                  <div className="flex items-center gap-3 text-2xs text-fg-3 tabular">
                    <span className="flex items-center gap-1" title="Downloads">
                      <Icon name="download" size={11} />
                      {compactCount(c.downloads)}
                    </span>
                    <span className="flex items-center gap-1" title="Likes">
                      <Icon name="heart" size={11} />
                      {compactCount(c.likes)}
                    </span>
                    {c.creator ? (
                      <span className="ml-auto truncate" title={c.creator}>
                        {c.creator}
                      </span>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        ))}
      </div>
      {loadingMore ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-fg-3">
          <Icon name="refresh" size={13} className="animate-spin" />
          Loading more…
        </div>
      ) : null}
    </div>
  );
}
