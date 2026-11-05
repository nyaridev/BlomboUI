/**
 * Home's carousels of random recent images, one per layout on trial: Spotlight (one large
 * picture with a thumbnail strip), Coverflow (the current image in front, its neighbors fanned
 * out behind) and Bento (a large picture beside the next four). They advance on their own every
 * few seconds, pause while pointed at or focused, and follow the arrow keys.
 */
import { cn } from "@client/lib/cn";
import { glide } from "@client/lib/motion";
import { useGalleryImage } from "@client/lib/queries";
import { Button, IconButton, Skeleton } from "@client/ui";
import { fileUrl, type GalleryImage } from "@shared/gallery";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { applyImageSettings } from "../../generate/applySettings";

const INTERVAL = 7000;

export interface CarouselProps {
  images: GalleryImage[];
  /** The gallery is on screen (no timer behind other views). */
  active: boolean;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}

function useCarousel(count: number, active: boolean) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: every move restarts the timer, a click too
  useEffect(() => {
    if (!active || paused || reduced || count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearTimeout(t);
  }, [index, active, paused, reduced, count]);
  const go = (n: number) => setIndex(((n % count) + count) % count);
  const at = Math.min(index, Math.max(0, count - 1));
  return {
    index: at,
    go,
    /** Spread on the carousel's root. */
    root: {
      tabIndex: 0,
      onPointerEnter: () => setPaused(true),
      onPointerLeave: () => setPaused(false),
      onFocus: () => setPaused(true),
      onBlur: () => setPaused(false),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft") go(at - 1);
        else if (e.key === "ArrowRight") go(at + 1);
        else return;
        e.preventDefault();
      },
    } as const,
  };
}

/** The picture's prompt, model and size, with View and Use these settings. */
function Caption({
  image,
  onOpen,
  onUseSettings,
  onPicture,
}: {
  image: GalleryImage;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
  /** Over the picture (white on a scrim) or below it (theme colors). */
  onPicture: boolean;
}) {
  const details = useGalleryImage(image.id);
  const s = details.data?.summary;
  const line = [s?.model ?? image.model, ...(s?.loras.slice(0, 2).map((l) => l.name) ?? [])]
    .concat(`${image.width}×${image.height}`)
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {details.isLoading ? (
        <Skeleton className="h-7 w-72 max-w-full" />
      ) : (
        <h2
          className={cn(
            "line-clamp-2 text-xl font-semibold tracking-tight text-balance",
            onPicture ? "text-white" : "text-fg",
          )}
        >
          {s?.prompt || image.name}
        </h2>
      )}
      <p className={cn("line-clamp-1 text-sm", onPicture ? "text-white/70" : "text-fg-3")}>
        {line}
      </p>
      <div className={cn("flex gap-2", !onPicture && "justify-center")}>
        <Button variant="primary" icon="maximize" onClick={() => onOpen(image.id)}>
          View
        </Button>
        {details.data ? (
          <Button
            variant={onPicture ? "overlay" : "secondary"}
            icon="generate"
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
  );
}

function Arrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  // IconButton is `relative`; the wrappers place it.
  return (
    <>
      <div className="absolute top-1/2 left-3 z-20 -translate-y-1/2">
        <IconButton icon="chevron-left" label="Previous image" variant="overlay" onClick={onPrev} />
      </div>
      <div className="absolute top-1/2 right-3 z-20 -translate-y-1/2">
        <IconButton icon="chevron-right" label="Next image" variant="overlay" onClick={onNext} />
      </div>
    </>
  );
}

const frame = "h-[clamp(300px,52vh,560px)]";

/* ── Spotlight ────────────────────────────────────────────────────────────── */

export function Spotlight({ images, active, onOpen, onUseSettings }: CarouselProps) {
  const c = useCarousel(images.length, active);
  const image = images[c.index];
  if (!image) return null;
  return (
    <div
      {...c.root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Random recent images"
      className={cn(
        "relative overflow-hidden rounded-xl border border-line bg-sunken focus-ring",
        frame,
      )}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={image.id}
          src={fileUrl(image)}
          alt=""
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={glide}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 30%" }}
        />
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/80 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 max-lg:flex-col max-lg:items-start max-lg:p-4">
        <div className="max-w-[560px]">
          <Caption image={image} onOpen={onOpen} onUseSettings={onUseSettings} onPicture />
        </div>
        {images.length > 1 ? (
          <div className="flex shrink-0 gap-1.5 max-lg:hidden">
            {images.slice(0, 8).map((im, i) => (
              <button
                key={im.id}
                type="button"
                aria-label={`Show image ${i + 1}`}
                aria-current={i === c.index || undefined}
                onClick={() => c.go(i)}
                className={cn(
                  "h-12 w-12 overflow-hidden rounded-md border-2 transition-[border-color,opacity] focus-ring",
                  i === c.index
                    ? "border-white"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <img src={im.thumb} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {images.length > 1 ? (
        <Arrows onPrev={() => c.go(c.index - 1)} onNext={() => c.go(c.index + 1)} />
      ) : null}
    </div>
  );
}

/* ── Coverflow ────────────────────────────────────────────────────────────── */

export function Coverflow({ images, active, onOpen, onUseSettings }: CarouselProps) {
  const c = useCarousel(images.length, active);
  const image = images[c.index];
  const n = images.length;
  if (!image) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        {...c.root}
        role="region"
        aria-roledescription="carousel"
        aria-label="Random recent images"
        className={cn("relative w-full overflow-hidden rounded-xl focus-ring", frame)}
      >
        {images.map((im, i) => {
          // Offset from the front card, the short way around.
          let d = i - c.index;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const far = Math.abs(d);
          return (
            <motion.button
              key={im.id}
              type="button"
              tabIndex={d === 0 ? 0 : -1}
              aria-hidden={far > 2 || undefined}
              aria-label={d === 0 ? `Open ${im.name}` : `Show image ${i + 1}`}
              onClick={() => (d === 0 ? onOpen(im.id) : c.go(i))}
              initial={false}
              animate={{
                x: `${-50 + d * 62}%`,
                scale: 1 - Math.min(far, 3) * 0.14,
                opacity: far > 2 ? 0 : 1 - far * 0.3,
              }}
              transition={glide}
              style={{ zIndex: 10 - far, pointerEvents: far > 2 ? "none" : undefined }}
              className="absolute top-0 left-1/2 aspect-[3/4] h-full overflow-hidden rounded-xl border border-line bg-sunken focus-ring"
            >
              <img
                src={far === 0 ? fileUrl(im) : im.thumb}
                alt=""
                className="h-full w-full object-cover"
              />
            </motion.button>
          );
        })}
        {n > 1 ? (
          <Arrows onPrev={() => c.go(c.index - 1)} onNext={() => c.go(c.index + 1)} />
        ) : null}
      </div>
      <div className="max-w-[640px] text-center">
        <Caption image={image} onOpen={onOpen} onUseSettings={onUseSettings} onPicture={false} />
      </div>
    </div>
  );
}

/* ── Bento ────────────────────────────────────────────────────────────────── */

export function Bento({ images, active, onOpen, onUseSettings }: CarouselProps) {
  const c = useCarousel(images.length, active);
  const image = images[c.index];
  if (!image) return null;
  const next = Array.from(
    { length: Math.min(4, images.length - 1) },
    (_, k) => (c.index + k + 1) % images.length,
  );
  return (
    <div
      {...c.root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Random recent images"
      className={cn(
        "grid grid-cols-4 grid-rows-2 gap-2 rounded-xl focus-ring max-lg:h-auto max-lg:grid-cols-2 max-lg:grid-rows-[360px_120px]",
        frame,
      )}
    >
      <div className="relative col-span-2 row-span-2 overflow-hidden rounded-xl border border-line bg-sunken max-lg:row-span-1">
        <AnimatePresence initial={false}>
          <motion.img
            key={image.id}
            src={fileUrl(image)}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={glide}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "50% 30%" }}
          />
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 max-lg:p-3">
          <Caption image={image} onOpen={onOpen} onUseSettings={onUseSettings} onPicture />
        </div>
      </div>
      {next.map((i, k) => {
        const im = images[i] as GalleryImage;
        return (
          <motion.button
            key={im.id}
            layout
            transition={glide}
            type="button"
            aria-label={`Show image ${i + 1}`}
            onClick={() => c.go(i)}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-line bg-sunken focus-ring",
              k >= 2 && "max-lg:hidden",
            )}
          >
            <img
              src={im.thumb}
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
            />
          </motion.button>
        );
      })}
    </div>
  );
}
