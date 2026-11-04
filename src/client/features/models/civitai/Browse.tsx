/**
 * Models → Civitai → Browse: a clear filter bar (saved filters, search, the NSFW blur, types,
 * base model, sort, period; what's listed follows the profile's Civitai site). A card opens its
 * model (a middle click opens it behind), a double click asks to download it (DownloadDialog),
 * recent searches and saved filters, and the results as one virtualized grid of ModelCards that
 * loads the next page as you near the end. Results come from the server's cached proxy.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useElementWidth } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import {
  qk,
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
  ModelCard,
  MultiSegmented,
  Popover,
  Select,
  Skeleton,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import {
  BrowseFilter,
  CIVITAI_BASE_MODELS,
  CIVITAI_FILTER_TYPES,
  CIVITAI_PERIOD_LABELS,
  CIVITAI_PERIODS,
  CIVITAI_SORTS,
  CIVITAI_TYPE_LABELS,
  type CivitaiCard,
  type CivitaiSort,
  compactCount,
  type SavedFilter,
} from "@shared/civitai";
import { shortBaseModel } from "@shared/models";
import { slugId } from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadDialog } from "./DownloadDialog";
import { cardMark } from "./marks";
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
  const seed = useCivitai((s) => s.seed);
  const settings = useSettings().data;
  useEffect(() => {
    if (settings) seed(settings.civitai.browse);
  }, [settings, seed]);
  if (!filter)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3 p-3">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar filter={filter} />
      <Results filter={filter} />
    </div>
  );
}

/* ── filter bar ─────────────────────────────────────────────────────────── */

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

function FilterBar({ filter }: { filter: BrowseFilter }) {
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
  const changed =
    JSON.stringify({ ...filter, query: "", username: "" }) !== JSON.stringify(defaults) ||
    filter.query !== "" ||
    filter.username !== "";

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
          onClear={() => {
            setText("");
            search("");
          }}
          className="flex-1"
          placeholder="Search Civitai: model names, tags, creators"
          aria-label="Search Civitai"
        />
        <Button variant="primary" type="submit" icon="search">
          Search
        </Button>
        <NsfwBlurToggle size="md" />
      </form>
      <div className="flex flex-wrap items-center gap-1.5">
        <MultiSegmented
          size="sm"
          label="Model types"
          allLabel="All"
          value={filter.types}
          onChange={(types) => setFilter({ types })}
          options={CIVITAI_FILTER_TYPES.map((t) => ({
            value: t,
            label: CIVITAI_TYPE_LABELS[t] ?? t,
          }))}
        />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <Select<string>
            size="sm"
            label="Base model"
            value={filter.baseModels[0] ?? "any"}
            onChange={(v) => setFilter({ baseModels: v === "any" ? [] : [v] })}
            className="w-[150px]"
            options={[
              { value: "any", label: "Any base model" },
              ...CIVITAI_BASE_MODELS.map((b) => ({ value: b, label: b })),
            ]}
          />
          <Select
            size="sm"
            label="Sort"
            value={filter.sort}
            onChange={(sort) => setFilter({ sort })}
            className="w-[160px]"
            options={CIVITAI_SORTS.map((s) => ({ value: s, label: s, icon: SORT_ICONS[s] }))}
          />
          <Select
            size="sm"
            label="Period"
            value={filter.period}
            onChange={(period) => setFilter({ period })}
            className="w-[116px]"
            options={CIVITAI_PERIODS.map((p) => ({
              value: p,
              label: CIVITAI_PERIOD_LABELS[p],
              icon: "calendar",
            }))}
          />
          {filter.username ? (
            <Chip size="sm" icon="user" selected onRemove={() => setFilter({ username: "" })}>
              {filter.username}
            </Chip>
          ) : null}
          {changed ? (
            <Button size="sm" variant="ghost" icon="undo" onClick={() => replace(defaults)}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>
      {searches.length ? (
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

function describe(f: BrowseFilter): string {
  return [
    f.query ? `"${f.query}"` : null,
    f.types.length ? f.types.map((t) => CIVITAI_TYPE_LABELS[t] ?? t).join(", ") : "All types",
    f.baseModels[0] ?? null,
    f.sort,
    CIVITAI_PERIOD_LABELS[f.period],
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

function Results({ filter }: { filter: BrowseFilter }) {
  const q = useCivitaiModels(filter);
  const open = useCivitai((s) => s.open);
  const [downloading, setDownloading] = useState<number | null>(null);
  const settings = useSettings().data;
  const blurNsfw = useCivitai((s) => s.blur);
  const showMarks = settings?.civitai.marks ?? true;
  const downloads = useLive((s) => s.downloads);
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const setFilter = useCivitai((s) => s.setFilter);

  const items = useMemo(() => {
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

  // The server remembers searches; show the new one in "Recent".
  const fresh = q.isSuccess && !q.isPlaceholderData;
  useEffect(() => {
    if (filter.query && fresh)
      void qc.invalidateQueries({ queryKey: qk.civitaiSearches(profileId) });
  }, [filter.query, fresh, qc, profileId]);

  if (q.isLoading)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3 p-3">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
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
  if (!items.length)
    return (
      <EmptyState
        icon="search"
        title="No models match"
        text="Try other words, fewer types or another period."
        action={
          <Button
            onClick={() => setFilter({ query: "", types: [], baseModels: [], period: "AllTime" })}
          >
            Search everything
          </Button>
        }
      />
    );
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
