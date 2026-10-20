/**
 * The gallery grid: a virtualized list of rows (hero, day headers, justified or square image
 * rows). Only visible rows are mounted, so tens of thousands of images scroll smoothly; the
 * next page loads as the end comes into view.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useElementWidth } from "@client/lib/hooks";
import { glide } from "@client/lib/motion";
import { useFavorite, useGalleryImage } from "@client/lib/queries";
import { Button, Skeleton } from "@client/ui";
import { fileUrl, type GalleryImage } from "@shared/gallery";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyImageSettings } from "../generate/applySettings";
import { buildRows, dayLabel, GAP, type GalleryRow } from "./rows";

export function Grid({
  items,
  total,
  layout,
  size,
  byDay,
  featured,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  onUseSettings,
}: {
  items: GalleryImage[];
  total: number;
  layout: "justified" | "grid";
  size: number;
  byDay: boolean;
  /** Showcase images for the hero (home view only). */
  featured: GalleryImage[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(innerRef);
  const rows = useMemo(
    () =>
      buildRows({
        items,
        layout,
        width,
        size,
        byDay,
        hero: featured.length > 0,
        complete: !hasMore,
      }),
    [items, layout, width, size, byDay, featured.length, hasMore],
  );
  const estimateSize = useCallback((i: number) => rows[i]?.height ?? 0, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 4,
    getItemKey: (i) => rows[i]?.key ?? i,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;

  useEffect(() => {
    if (hasMore && !loadingMore && rows.length > 0 && lastIndex >= rows.length - 8) onLoadMore();
  }, [hasMore, loadingMore, lastIndex, rows.length, onLoadMore]);

  return (
    <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-10">
      <div
        ref={innerRef}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          return (
            <div
              key={v.key}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${v.start}px)`, height: row.height }}
            >
              <Row
                row={row}
                featured={featured}
                total={total}
                onOpen={onOpen}
                onUseSettings={onUseSettings}
              />
            </div>
          );
        })}
      </div>
      {loadingMore ? (
        <div className="flex justify-center py-4 text-xs text-fg-3">Loading more images…</div>
      ) : null}
    </div>
  );
}

function Row({
  row,
  featured,
  total,
  onOpen,
  onUseSettings,
}: {
  row: GalleryRow;
  featured: GalleryImage[];
  total: number;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}) {
  if (row.kind === "hero")
    return <Hero images={featured} total={total} onOpen={onOpen} onUseSettings={onUseSettings} />;
  if (row.kind === "header")
    return (
      <div className="flex h-full items-end gap-3 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{dayLabel(row.day)}</h2>
        {row.count !== null ? (
          <span className="text-sm text-fg-3 tabular">
            {row.count.toLocaleString()} {row.count === 1 ? "image" : "images"}
          </span>
        ) : null}
      </div>
    );
  return (
    <div className="flex" style={{ gap: GAP }}>
      {row.items.map(({ item, width, height }) => (
        <div key={item.id} style={{ width, height }} className="shrink-0">
          <Tile image={item} onOpen={onOpen} />
        </div>
      ))}
    </div>
  );
}

/* ── tile ─────────────────────────────────────────────────────────────────── */

export const Tile = memo(function Tile({
  image,
  onOpen,
}: {
  image: GalleryImage;
  onOpen: (id: number) => void;
}) {
  const favorite = useFavorite();
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="group relative h-full w-full overflow-hidden rounded-md bg-sunken">
      <button
        type="button"
        onClick={() => onOpen(image.id)}
        aria-label={`Open ${image.name}`}
        className="absolute inset-0 focus-ring"
      >
        <img
          src={image.thumb}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.03]",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      {image.model ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5 text-2xs text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          <Icon name="models" size={11} />
          <span className="truncate">{image.model}</span>
        </div>
      ) : null}
      {image.rating ? (
        <div
          className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 font-mono text-2xs text-white/90 tabular"
          role="img"
          aria-label={`${image.rating} of 5 stars`}
        >
          <Icon name="star" size={10} className="fill-current text-yellow-ink" />
          {image.rating}
        </div>
      ) : null}
      <button
        type="button"
        aria-label={image.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={image.favorite}
        onClick={() => favorite.mutate({ ids: [image.id], favorite: !image.favorite })}
        className={cn(
          "absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 focus-ring",
          image.favorite
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Icon
          name="heart"
          size={14}
          className={image.favorite ? "fill-current text-pink-ink" : undefined}
        />
      </button>
    </div>
  );
});

/* ── hero ─────────────────────────────────────────────────────────────────── */

function Hero({
  images,
  total,
  onOpen,
  onUseSettings,
}: {
  images: GalleryImage[];
  total: number;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}) {
  const [index, setIndex] = useState(0);
  const image = images[Math.min(index, images.length - 1)];
  const details = useGalleryImage(image?.id ?? null);
  if (!image) return null;
  const s = details.data?.summary;
  const favorite = image.favorite;
  const line = [
    s?.model,
    ...(s?.loras.slice(0, 2).map((l) => l.name) ?? []),
    `${image.width}×${image.height}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="pt-5 pb-4" style={{ height: "100%" }}>
      <div className="relative h-full overflow-hidden rounded-2xl border border-line bg-sunken">
        <motion.img
          key={image.id}
          src={fileUrl(image)}
          alt=""
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={glide}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 30%" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-[560px] flex-col justify-end gap-3 p-7">
          <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-white/70 uppercase">
            <Icon
              name={favorite ? "star" : "sparkle"}
              size={13}
              className={favorite ? "fill-current text-yellow-ink" : undefined}
            />
            {favorite ? "Featured favorite" : "Latest image"} · {total.toLocaleString()} in your
            gallery
          </span>
          {s?.prompt ? (
            <h2 className="line-clamp-2 text-2xl font-semibold tracking-tight text-balance text-white">
              {s.prompt}
            </h2>
          ) : details.isLoading ? (
            <Skeleton className="h-8 w-80" />
          ) : (
            <h2 className="text-2xl font-semibold tracking-tight text-white">{image.name}</h2>
          )}
          {line ? <p className="line-clamp-1 text-sm text-white/70">{line}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" icon="maximize" onClick={() => onOpen(image.id)}>
              View
            </Button>
            {details.data ? (
              <Button
                icon="generate"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                onClick={() => {
                  const d = details.data;
                  void applyImageSettings(d.settings, d.summary.seed).then(
                    (ok) => ok && onUseSettings(),
                  );
                }}
              >
                Use these settings
              </Button>
            ) : null}
          </div>
        </div>
        {images.length > 1 ? (
          <div className="absolute right-5 bottom-5 flex gap-1.5">
            {images.map((im, i) => (
              <button
                key={im.id}
                type="button"
                aria-label={`Show featured image ${i + 1}`}
                aria-current={i === index || undefined}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full bg-white transition-all focus-ring",
                  i === index ? "w-6" : "w-1.5 opacity-40 hover:opacity-70",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
