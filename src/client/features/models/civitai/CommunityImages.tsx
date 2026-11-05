/**
 * The images people posted with a version (Civitai's images endpoint), under the model page
 * wider than the columns above (1760 px at most), five a row at most. Filters: Civitai's order (most reactions, most
 * comments, newest) and period, and With prompt (only images whose poster shared how they were
 * made; filtered here, so it keeps loading pages until there's enough to show). The grid is
 * virtualized against the page's own scroll and asks for the next page near its end. A tile shows who posted it and, when they shared how
 * it was made, a mark and Copy prompt (on hover); a click opens the full-screen viewer over
 * everything loaded so far. NSFW tiles are veiled while the blur is on.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { useElementWidth } from "@client/lib/hooks";
import { clamp } from "@client/lib/number";
import { useCivitaiCommunityImages } from "@client/lib/queries";
import {
  Button,
  Chip,
  CopyButton,
  EmptyState,
  ImageViewer,
  Select,
  Skeleton,
  Veil,
} from "@client/ui";
import {
  CIVITAI_PERIOD_LABELS,
  CIVITAI_PERIODS,
  type CivitaiImage,
  type CivitaiPeriod,
  type CivitaiVersion,
  civitaiFullSize,
  IMAGE_SORTS,
  type ImageSort,
} from "@shared/civitai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const GAP = 8;
const MIN_TILE = 180;
const MAX_COLS = 5;

const SORT_LABELS: Record<ImageSort, string> = {
  "Most Reactions": "Most reactions",
  "Most Comments": "Most comments",
  Newest: "Newest",
};
const SORT_ICONS: Record<ImageSort, IconName> = {
  "Most Reactions": "heart",
  "Most Comments": "text",
  Newest: "clock",
};

export function CommunityImages({
  version,
  scrollRef,
  blurNsfw,
}: {
  version: CivitaiVersion;
  /** The page's scroll box (the grid is virtualized against it). */
  scrollRef: RefObject<HTMLDivElement | null>;
  blurNsfw: boolean;
}) {
  const [sort, setSort] = useState<ImageSort>("Most Reactions");
  const [period, setPeriod] = useState<CivitaiPeriod>("AllTime");
  const [withPrompt, setWithPrompt] = useState(false);
  const q = useCivitaiCommunityImages(version.id, sort, period);
  const loaded = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const items = useMemo(
    () => (withPrompt ? loaded.filter((i) => i.meta?.prompt) : loaded),
    [loaded, withPrompt],
  );
  const [viewing, setViewing] = useState<number | null>(null);
  const more = () => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  };
  // With prompt can leave a page or two with little to show: load on until there's a screenful.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `more` reads the latest query
  useEffect(() => {
    if (withPrompt && items.length < 24 && q.hasNextPage && !q.isFetchingNextPage) more();
  }, [withPrompt, items.length, q.hasNextPage, q.isFetchingNextPage]);

  return (
    // Wider than the columns above (1360 px), so the pictures get the room on big screens.
    <section className="mx-auto flex max-w-[1760px] flex-col gap-4 px-6 pb-14 max-lg:px-3">
      <div className="flex items-center gap-3">
        <Icon name="gallery" size={15} className="shrink-0 text-fg-3" />
        <h3 className="shrink-0 text-base font-semibold text-fg">Made with this model</h3>
        <span className="truncate text-2xs text-fg-3">Posted with {version.name}</span>
        <span className="h-px min-w-6 flex-1 bg-line" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Order"
          value={sort}
          onChange={setSort}
          className="w-[168px]"
          options={IMAGE_SORTS.map((s) => ({
            value: s,
            label: SORT_LABELS[s],
            icon: SORT_ICONS[s],
          }))}
        />
        <Select
          label="Period"
          value={period}
          onChange={setPeriod}
          className="w-[132px]"
          options={CIVITAI_PERIODS.map((p) => ({
            value: p,
            label: CIVITAI_PERIOD_LABELS[p],
            icon: "calendar" as const,
          }))}
        />
        <Chip
          size="lg"
          icon="sparkle"
          selected={withPrompt}
          onClick={() => setWithPrompt((v) => !v)}
        >
          With prompt
        </Chip>
        {loaded.length ? (
          <span className="ml-auto text-2xs text-fg-3 tabular">
            {withPrompt ? `${items.length} of ${loaded.length} loaded` : `${loaded.length} loaded`}
            {q.hasNextPage ? ", more as you scroll" : ""}
          </span>
        ) : null}
      </div>
      {q.isLoading ? (
        <div className="grid grid-cols-5 gap-2 max-lg:grid-cols-3 max-sm:grid-cols-2">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : q.error ? (
        <EmptyState
          icon="globe"
          tone="warning"
          title="Couldn't load the images people posted"
          text={q.error.message}
          action={<Button onClick={() => void q.refetch()}>Try again</Button>}
        />
      ) : items.length ? (
        <Grid
          items={items}
          scrollRef={scrollRef}
          blurNsfw={blurNsfw}
          onOpen={setViewing}
          onEnd={more}
        />
      ) : q.hasNextPage || q.isFetchingNextPage ? null : (
        <p className="py-6 text-center text-sm text-fg-3">
          {loaded.length
            ? "None of these images has its prompt shared. Turn off With prompt to see them all."
            : period !== "AllTime"
              ? `Nothing posted with ${version.name} in this period. Try a longer one.`
              : `No one has posted images with ${version.name} yet. They show up here when they do.`}
        </p>
      )}
      {q.isFetchingNextPage ? (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-fg-3">
          <Icon name="refresh" size={13} className="animate-spin" />
          Loading more…
        </div>
      ) : null}
      {viewing !== null && items.length ? (
        <ImageViewer
          images={items.map((im, i) => ({
            key: String(i),
            src: im.full,
            alt: "",
            // The tile's small picture is already loaded: it shows until the large one is.
            preview: im.thumb,
            ...civitaiFullSize(im),
          }))}
          index={Math.min(viewing, items.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </section>
  );
}

function Grid({
  items,
  scrollRef,
  blurNsfw,
  onOpen,
  onEnd,
}: {
  items: CivitaiImage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  blurNsfw: boolean;
  onOpen: (index: number) => void;
  onEnd: () => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(gridRef);
  const cols = clamp(Math.floor((width + GAP) / (MIN_TILE + GAP)), 2, MAX_COLS);
  const tileW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_TILE;
  const tileH = Math.round((tileW * 4) / 3);
  const rows = Math.ceil(items.length / cols);

  // Where the grid starts in the page's scroll. The folds above it open and close, so it's
  // measured again whenever the page's content above changes size.
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;
    const measure = () =>
      setMargin(
        grid.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop,
      );
    measure();
    const ro = new ResizeObserver(measure);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => ro.disconnect();
  }, [scrollRef]);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileH + GAP,
    overscan: 3,
    scrollMargin: margin,
  });
  useEffect(() => {
    if (tileH > 0) virtualizer.measure();
  }, [tileH, virtualizer]);
  const visible = virtualizer.getVirtualItems();
  const last = visible.length ? (visible[visible.length - 1]?.index ?? -1) : -1;
  // Near the end: ask for the next page.
  useEffect(() => {
    if (rows > 0 && last >= rows - 3) onEnd();
  }, [last, rows, onEnd]);

  return (
    <div ref={gridRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {visible.map((v) => (
        <div
          key={v.key}
          className="absolute inset-x-0 top-0 grid"
          style={{
            transform: `translateY(${v.start - margin}px)`,
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: GAP,
          }}
        >
          {items.slice(v.index * cols, v.index * cols + cols).map((img, k) => (
            <Tile
              key={img.thumb}
              img={img}
              height={tileH}
              blurNsfw={blurNsfw}
              onOpen={() => onOpen(v.index * cols + k)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Tile({
  img,
  height,
  blurNsfw,
  onOpen,
}: {
  img: CivitaiImage;
  height: number;
  blurNsfw: boolean;
  onOpen: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  // Switching the blur veils it again, as the Veil does.
  const [blurWas, setBlurWas] = useState(blurNsfw);
  if (blurWas !== blurNsfw) {
    setBlurWas(blurNsfw);
    setRevealed(false);
  }
  const veiled = blurNsfw && img.nsfw && !revealed;
  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-line bg-sunken"
      style={{ height }}
    >
      <Veil active={blurNsfw && img.nsfw} compact onReveal={() => setRevealed(true)}>
        <img
          src={img.thumb}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover transition-[scale] duration-200 group-hover:scale-[1.03]"
        />
      </Veil>
      {veiled ? null : (
        <button
          type="button"
          aria-label={`Open the image${img.by ? ` by ${img.by}` : ""} full size`}
          onClick={onOpen}
          className="absolute inset-0 z-10 cursor-zoom-in rounded-lg focus-ring"
        />
      )}
      {img.meta ? (
        <span
          title="Its poster shared how it was made"
          className="pointer-events-none absolute top-1.5 right-1.5 z-20 grid h-5 w-5 place-items-center rounded-xs bg-black/60 text-white"
        >
          <Icon name="sparkle" size={11} />
        </span>
      ) : null}
      {veiled ? null : (
        <div className="absolute inset-x-1.5 bottom-1.5 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          {img.by ? (
            <span className="pointer-events-none min-w-0 truncate rounded-xs bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              {img.by}
            </span>
          ) : null}
          {img.meta?.prompt ? (
            <CopyButton
              text={img.meta.prompt}
              label="Copy prompt"
              className="ml-auto bg-black/60 text-white hover:bg-black/75 hover:text-white"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
