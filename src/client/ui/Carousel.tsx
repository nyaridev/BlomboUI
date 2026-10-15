/**
 * An image carousel: one large image with previous/next buttons and a thumbnail strip. Arrow
 * keys move while it has focus. Images marked NSFW stay blurred until clicked when `blurNsfw` is
 * on; a revealed image stays revealed while the carousel is open. Videos show their first frame.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import { Veil } from "./library";

export interface CarouselImage {
  /** Small image for the strip. */
  thumb: string;
  /** Large image for the stage. */
  full: string;
  nsfw?: boolean;
  video?: boolean;
}

export function Carousel({
  images,
  label,
  blurNsfw = true,
  ratio = 4 / 5,
  empty,
  className,
}: {
  images: CarouselImage[];
  label: string;
  blurNsfw?: boolean;
  /** Width / height of the stage. */
  ratio?: number;
  /** Shown when there are no images. */
  empty?: ReactNode;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const strip = useRef<HTMLDivElement>(null);
  const count = images.length;
  const current = images[Math.min(index, count - 1)];

  // A new set of images (another version) starts at the first one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the images change
  useEffect(() => {
    setIndex(0);
    setRevealed(new Set());
  }, [images]);

  // Keep the selected thumbnail in view, scrolling only the strip (never the page around it).
  useEffect(() => {
    const box = strip.current;
    const el = box?.children[index] as HTMLElement | undefined;
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft) box.scrollTo({ left, behavior: "smooth" });
    else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth)
      box.scrollTo({ left: left + el.offsetWidth - box.clientWidth, behavior: "smooth" });
  }, [index]);

  const go = (delta: number) => {
    if (count > 0) setIndex((i) => (i + delta + count) % count);
  };
  const veiled = (i: number) => Boolean(images[i]?.nsfw && blurNsfw && !revealed.has(i));

  if (!current)
    return (
      <div
        className={cn("overflow-hidden rounded-xl border border-line bg-sunken", className)}
        style={{ aspectRatio: String(ratio) }}
      >
        {empty}
      </div>
    );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <section
        aria-roledescription="carousel"
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage takes arrow keys while focused
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          else if (e.key === "ArrowLeft") go(-1);
          else return;
          e.preventDefault();
        }}
        className="group relative max-h-[68vh] overflow-hidden rounded-xl border border-line bg-sunken focus-ring"
        style={{ aspectRatio: String(ratio) }}
      >
        <Veil
          key={index}
          active={veiled(index)}
          onReveal={() => setRevealed((r) => new Set(r).add(index))}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.img
              key={current.full}
              src={current.full}
              alt=""
              decoding="async"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </AnimatePresence>
        </Veil>
        {count > 1 ? (
          <>
            <IconButton
              icon="chevron-left"
              label="Previous image"
              variant="secondary"
              size="sm"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-2 z-20 -translate-y-1/2 rounded-full opacity-0 shadow-pop transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            />
            <IconButton
              icon="chevron-right"
              label="Next image"
              variant="secondary"
              size="sm"
              onClick={() => go(1)}
              className="absolute top-1/2 right-2 z-20 -translate-y-1/2 rounded-full opacity-0 shadow-pop transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            />
          </>
        ) : null}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex items-center gap-1.5">
          {current.video ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-black/60 px-2 text-[10px] font-semibold text-white">
              <Icon name="play" size={10} />
              Video · first frame
            </span>
          ) : null}
          <span className="ml-auto rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white tabular">
            {index + 1} / {count}
          </span>
        </div>
      </section>
      {count > 1 ? (
        <div ref={strip} className="scroll-quiet flex gap-1.5 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}${img.nsfw ? " (NSFW)" : ""}`}
              aria-current={i === index || undefined}
              className={cn(
                "relative h-14 w-11 shrink-0 overflow-hidden rounded-md border bg-sunken transition-[border-color,opacity] focus-ring",
                i === index
                  ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                  : "border-line opacity-70 hover:opacity-100",
              )}
            >
              <img
                src={img.thumb}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn(
                  "h-full w-full object-cover",
                  veiled(i) && "scale-125 blur-md saturate-50",
                )}
              />
              {img.video ? (
                <Icon
                  name="play"
                  size={10}
                  className="absolute right-1 bottom-1 text-white drop-shadow"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
