/**
 * An image carousel: one large image with previous/next buttons and a thumbnail strip. Arrow
 * keys move while it has focus. Images marked NSFW stay blurred until clicked when `blurNsfw` is
 * on; a revealed image stays revealed while the carousel is open. Videos show their first frame.
 * The stage shows the small picture at once and swaps in the large one when it's ready
 * (`SharpImage`).
 *
 * The stage is as wide as the carousel and `1 / ratio` of that tall, up to `maxHeight` (a
 * container query, so it follows the column it sits in, not the window). `side` moves the strip
 * into a column on the left once the carousel is at least 672 px wide; `onOpen` makes a click on
 * the image open it (a full-screen viewer, say).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import { Veil } from "./library";
import { SharpImage } from "./SharpImage";

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
  onIndexChange,
  maxHeight = "68vh",
  side = false,
  onOpen,
}: {
  images: CarouselImage[];
  label: string;
  blurNsfw?: boolean;
  /** Width / height of the stage. */
  ratio?: number;
  /** Shown when there are no images. */
  empty?: ReactNode;
  className?: string;
  /** The image on the stage changed (pass a stable function, such as a state setter). */
  onIndexChange?: (index: number) => void;
  /** The tallest the stage gets (any CSS length). */
  maxHeight?: string;
  /** Thumbnails in a column beside the stage when there's room. */
  side?: boolean;
  /** A click on the (revealed) image. */
  onOpen?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  // Switching the blur forgets what was clicked open, so switching it back blurs everything.
  const [blurWas, setBlurWas] = useState(blurNsfw);
  if (blurWas !== blurNsfw) {
    setBlurWas(blurNsfw);
    setRevealed(new Set());
  }
  const strip = useRef<HTMLDivElement>(null);
  const count = images.length;
  const current = images[Math.min(index, count - 1)];

  // A new set of images (another version) starts at the first one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the images change
  useEffect(() => {
    setIndex(0);
    setRevealed(new Set());
  }, [images]);

  // Keep the selected thumbnail in view, scrolling only the strip (never the page around it);
  // the strip runs across, or down when it's a side column.
  useEffect(() => {
    const box = strip.current;
    const el = box?.children[index] as HTMLElement | undefined;
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    const top = el.offsetTop - box.offsetTop;
    if (left < box.scrollLeft) box.scrollTo({ left, behavior: "smooth" });
    else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth)
      box.scrollTo({ left: left + el.offsetWidth - box.clientWidth, behavior: "smooth" });
    if (top < box.scrollTop) box.scrollTo({ top, behavior: "smooth" });
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: top + el.offsetHeight - box.clientHeight, behavior: "smooth" });
  }, [index]);

  useEffect(
    () => onIndexChange?.(Math.max(0, Math.min(index, count - 1))),
    [index, count, onIndexChange],
  );

  const go = (delta: number) => {
    if (count > 0) setIndex((i) => (i + delta + count) % count);
  };
  const veiled = (i: number) => Boolean(images[i]?.nsfw && blurNsfw && !revealed.has(i));

  // Measured against the carousel itself (`@container`), so it follows its column.
  const height = `min(${maxHeight}, ${100 / ratio}cqw)`;

  if (!current)
    return (
      <div className={cn("@container", className)}>
        <div className="overflow-hidden rounded-xl border border-line bg-sunken" style={{ height }}>
          {empty}
        </div>
      </div>
    );

  return (
    // The outer box is the container; a container query can't style the box it measures.
    <div className={cn("@container", className)} style={{ "--stage-h": height } as CSSProperties}>
      <div className={cn("flex flex-col gap-2", side && count > 1 && "@2xl:flex-row-reverse")}>
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
          className={cn(
            "group relative h-(--stage-h) w-full min-w-0 overflow-hidden rounded-xl border border-line bg-sunken focus-ring",
            side && "@2xl:flex-1",
          )}
        >
          <Veil
            key={index}
            active={veiled(index)}
            onReveal={() => setRevealed((r) => new Set(r).add(index))}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={current.full}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="absolute inset-0"
              >
                {/* The strip's small picture shows at once; the large one swaps in when ready. */}
                <SharpImage
                  small={current.thumb}
                  large={current.full}
                  fit="contain"
                  className="h-full w-full"
                />
              </motion.div>
            </AnimatePresence>
          </Veil>
          {onOpen && !veiled(index) ? (
            <button
              type="button"
              aria-label="Open full size"
              onClick={() => onOpen(index)}
              className="absolute inset-0 z-10 cursor-zoom-in"
            />
          ) : null}
          {count > 1 ? (
            <>
              <IconButton
                icon="chevron-left"
                label="Previous image"
                variant="secondary"
                size="sm"
                onClick={() => go(-1)}
                className="absolute top-1/2 left-2 z-20 -translate-y-1/2 rounded-md opacity-0 shadow-pop transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100"
              />
              <IconButton
                icon="chevron-right"
                label="Next image"
                variant="secondary"
                size="sm"
                onClick={() => go(1)}
                className="absolute top-1/2 right-2 z-20 -translate-y-1/2 rounded-md opacity-0 shadow-pop transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100"
              />
            </>
          ) : null}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex items-center gap-1.5">
            {current.video ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-xs bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                <Icon name="play" size={10} />
                Video · first frame
              </span>
            ) : null}
            <span className="ml-auto rounded-xs bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular">
              {index + 1} / {count}
            </span>
          </div>
        </section>
        {count > 1 ? (
          <div
            ref={strip}
            className={cn(
              "scroll-quiet flex shrink-0 gap-1.5 overflow-x-auto pb-1",
              side &&
                "@2xl:h-(--stage-h) @2xl:flex-col @2xl:overflow-x-hidden @2xl:overflow-y-auto @2xl:pb-0",
            )}
          >
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}${img.nsfw ? " (NSFW)" : ""}`}
                aria-current={i === index || undefined}
                className={cn(
                  "relative h-14 w-11 shrink-0 overflow-hidden rounded-md border bg-sunken transition-[border-color,opacity] focus-ring",
                  side && "@2xl:h-[72px] @2xl:w-14",
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
    </div>
  );
}
