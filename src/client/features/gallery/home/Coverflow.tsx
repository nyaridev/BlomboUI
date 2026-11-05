/**
 * Home's carousel of random recent images: the current one in front, its neighbors fanned out
 * behind, and its prompt with View and Use these settings below. It advances on its own every
 * few seconds, pauses while pointed at or focused, and follows the arrow keys.
 */
import { glide } from "@client/lib/motion";
import { useGalleryImage } from "@client/lib/queries";
import { Button, IconButton, Skeleton } from "@client/ui";
import { fileUrl, type GalleryImage } from "@shared/gallery";
import { motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { applyImageSettings } from "../../generate/applySettings";
import { stillOrAnimated } from "../media";

const INTERVAL = 7000;

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

/**
 * The picture's prompt, model and size, with View and Use these settings. Its height never
 * changes (two lines for the prompt, one for the details), so the page below doesn't jump.
 */
function Caption({
  image,
  onOpen,
  onUseSettings,
}: {
  image: GalleryImage;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}) {
  const details = useGalleryImage(image.id);
  const s = details.data?.summary;
  const line = [s?.model ?? image.model, ...(s?.loras.slice(0, 2).map((l) => l.name) ?? [])]
    .concat(`${image.width}×${image.height}`)
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-col items-center gap-2.5">
      <div className="flex h-14 w-full items-center justify-center">
        {details.isLoading ? (
          <Skeleton className="h-7 w-72 max-w-full" />
        ) : (
          <h2 className="line-clamp-2 text-xl leading-7 font-semibold tracking-tight text-balance text-fg">
            {s?.prompt || image.name}
          </h2>
        )}
      </div>
      <p className="h-5 w-full truncate text-sm text-fg-3">{line}</p>
      <div className="flex gap-2">
        <Button variant="primary" icon="maximize" onClick={() => onOpen(image.id)}>
          View
        </Button>
        <Button
          icon="generate"
          disabled={!details.data}
          onClick={() => {
            const d = details.data;
            if (d)
              void applyImageSettings(d.settings, d.summary.seed).then(
                (ok) => ok && onUseSettings(),
              );
          }}
        >
          Use these settings
        </Button>
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

export function Coverflow({
  images,
  active,
  onOpen,
  onUseSettings,
}: {
  images: GalleryImage[];
  /** The gallery is on screen (no timer behind other views or the lightbox). */
  active: boolean;
  onOpen: (id: number) => void;
  onUseSettings: () => void;
}) {
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
        className="relative h-[clamp(300px,52vh,560px)] w-full overflow-hidden rounded-xl focus-ring"
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
              {/* The front card shows the full picture over its thumbnail, so it never blinks. */}
              <img src={im.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {far === 0 && stillOrAnimated(im) ? (
                <img
                  src={fileUrl(im)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
            </motion.button>
          );
        })}
        {n > 1 ? (
          <Arrows onPrev={() => c.go(c.index - 1)} onNext={() => c.go(c.index + 1)} />
        ) : null}
      </div>
      <div className="w-full max-w-[640px] text-center">
        <Caption image={image} onOpen={onOpen} onUseSettings={onUseSettings} />
      </div>
    </div>
  );
}
