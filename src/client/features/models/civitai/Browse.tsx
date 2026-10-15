/**
 * Models → Civitai → Browse: a clear filter bar (search, types, base model, sort, period, NSFW),
 * recent searches and saved filters, and the results as one virtualized grid of ModelCards that
 * loads the next page as you near the end. Results come from the server's cached proxy.
 */
import { Icon } from "@client/icons/Icon";
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
  Popover,
  Segmented,
  Select,
  Skeleton,
  TextField,
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
  compactCount,
  type SavedFilter,
} from "@shared/civitai";
import { shortBaseModel } from "@shared/models";
import { slugId } from "@shared/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { cardMark } from "./marks";
import { useCivitai } from "./state";

const MIN_CARD = 188;
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3 p-5">
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
  const toggleType = (t: string) =>
    setFilter({
      types: filter.types.includes(t) ? filter.types.filter((x) => x !== t) : [...filter.types, t],
    });
  const defaults = settings ? BrowseFilter.parse(settings.civitai.browse) : BrowseFilter.parse({});
  const changed =
    JSON.stringify({ ...filter, query: "", username: "" }) !== JSON.stringify(defaults) ||
    filter.query !== "" ||
    filter.username !== "";

  return (
    <div className="flex flex-col gap-2.5 border-b border-line px-5 pt-4 pb-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(text);
        }}
      >
        <TextField
          size="lg"
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
        <Button size="lg" variant="primary" type="submit" icon="search">
          Search
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          size="sm"
          selected={filter.types.length === 0}
          onClick={() => setFilter({ types: [] })}
        >
          All types
        </Chip>
        {CIVITAI_FILTER_TYPES.map((t) => (
          <Chip key={t} size="sm" selected={filter.types.includes(t)} onClick={() => toggleType(t)}>
            {CIVITAI_TYPE_LABELS[t] ?? t}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
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
          options={CIVITAI_SORTS.map((s) => ({
            value: s,
            label: s,
            icon: s === "Newest" ? "clock" : s === "Most Downloaded" ? "download" : "heart",
          }))}
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
        <Segmented
          size="sm"
          label="NSFW models"
          value={filter.nsfw ? "show" : "hide"}
          onChange={(v) => setFilter({ nsfw: v === "show" })}
          options={[
            { value: "show", label: "NSFW", icon: "eye", title: "Show NSFW models (blurred)" },
            { value: "hide", label: "SFW only", icon: "eye-off", title: "Hide NSFW models" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1">
          {filter.username ? (
            <Chip size="sm" icon="user" selected onRemove={() => setFilter({ username: "" })}>
              {filter.username}
            </Chip>
          ) : null}
          <SavedFilters filter={filter} onApply={replace} />
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
      placement="bottom-end"
      className="w-80 p-0"
      trigger={
        <Button size="sm" variant="ghost" icon="star">
          Saved filters{saved.length ? ` (${saved.length})` : ""}
        </Button>
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
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
    f.nsfw ? null : "SFW only",
  ]
    .filter(Boolean)
    .join(" · ");
}

/* ── results ────────────────────────────────────────────────────────────── */

function Results({ filter }: { filter: BrowseFilter }) {
  const q = useCivitaiModels(filter);
  const open = useCivitai((s) => s.open);
  const settings = useSettings().data;
  const blurNsfw = settings?.models.blurNsfw ?? true;
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-3 p-5">
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
    <Grid
      items={items}
      blurNsfw={blurNsfw}
      mark={(c) => cardMark(c, downloads, showMarks)}
      onOpen={(c) => open(c.id, c.name)}
      onEnd={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
      }}
      loadingMore={q.isFetchingNextPage}
      fetching={q.isFetching && !q.isFetchingNextPage}
    />
  );
}

function Grid({
  items,
  blurNsfw,
  mark,
  onOpen,
  onEnd,
  loadingMore,
  fetching,
}: {
  items: CivitaiCard[];
  blurNsfw: boolean;
  mark: (c: CivitaiCard) => ReturnType<typeof cardMark>;
  onOpen: (c: CivitaiCard) => void;
  onEnd: () => void;
  loadingMore: boolean;
  fetching: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(innerRef);
  const cols = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)));
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
        "scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 transition-opacity",
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
                onClick={() => onOpen(c)}
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
