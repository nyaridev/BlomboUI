/**
 * Looks on trial for File Info's Civitai images (dev "Layouts" panel, `fileinfo.images`), next to
 * the stage carousel: a filmstrip of images at their own shape, the image beside how it was made,
 * and a grid. In all of them a click picks the image whose settings show, a click on the picked
 * one opens it full screen, ← → move, and NSFW images stay blurred until clicked.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Button, IconButton, ImageViewer, Panel } from "@client/ui";
import type { CivitaiImage } from "@shared/civitai";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ImageSettings } from "./CivitaiMatch";

export type ImagesLook = "stage" | "filmstrip" | "split" | "grid";

export const IMAGE_LOOKS = [
  { id: "stage", label: "Stage (now)" },
  { id: "filmstrip", label: "Filmstrip" },
  { id: "split", label: "Image + settings" },
  { id: "grid", label: "Grid" },
] as const;

interface LookProps {
  images: CivitaiImage[];
  label: string;
  blurNsfw: boolean;
  index: number;
  onIndex: (index: number) => void;
}

const ratioOf = (img: CivitaiImage | undefined) =>
  img?.width && img.height ? img.width / img.height : 2 / 3;

/** Which NSFW images were clicked open (forgotten when the images change), and the viewer. */
function useGallery({ images, blurNsfw, index, onIndex }: LookProps) {
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [viewing, setViewing] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the images change
  useEffect(() => setRevealed(new Set()), [images]);
  const veiled = (i: number) => Boolean(images[i]?.nsfw && blurNsfw && !revealed.has(i));
  const count = images.length;
  return {
    veiled,
    /** A click: reveal it, pick it, or (already picked) look at it full screen. */
    click: (i: number) => {
      if (veiled(i)) setRevealed((r) => new Set(r).add(i));
      else if (i === index) setViewing(true);
      onIndex(i);
    },
    go: (delta: number) => count && onIndex((index + delta + count) % count),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      if (count) onIndex((index + (e.key === "ArrowRight" ? 1 : -1) + count) % count);
    },
    viewer: viewing ? (
      <ImageViewer
        images={images.map((img, i) => ({ key: String(i), src: img.full, alt: "" }))}
        index={index}
        onIndex={onIndex}
        onClose={() => setViewing(false)}
      />
    ) : null,
  };
}

/** A picture that may be blurred, with the NSFW chip over it. */
function Picture({
  img,
  veiled,
  fit = "cover",
  large,
}: {
  img: CivitaiImage;
  veiled: boolean;
  fit?: "cover" | "contain";
  large?: boolean;
}) {
  return (
    <>
      <img
        src={large ? img.full : img.thumb}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(
          "absolute inset-0 h-full w-full transition-[filter,transform] duration-200",
          fit === "cover" ? "object-cover" : "object-contain",
          veiled && "scale-110 blur-xl saturate-50",
        )}
      />
      {veiled ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-white uppercase">
            <Icon name="eye-off" size={12} />
            NSFW · click to reveal
          </span>
        </span>
      ) : null}
      {img.video ? (
        <span className="absolute bottom-2 left-2 inline-flex h-5 items-center gap-1 rounded-xs bg-black/60 px-1.5 text-[10px] font-semibold text-white">
          <Icon name="play" size={10} />
          First frame
        </span>
      ) : null}
    </>
  );
}

const Count = ({ index, count }: { index: number; count: number }) => (
  <span className="pointer-events-none absolute right-2 bottom-2 z-10 rounded-xs bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular">
    {index + 1} / {count}
  </span>
);

const ARROW =
  "absolute top-1/2 z-10 -translate-y-1/2 rounded-md shadow-pop opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

/** One row of images at their own shape and the same height, scrolled sideways. */
export function Filmstrip(props: LookProps) {
  const { images, label, index } = props;
  const g = useGallery(props);
  const row = useRef<HTMLDivElement>(null);
  // Keep the picked image in view, scrolling only the row.
  useEffect(() => {
    const box = row.current;
    const el = box?.children[index] as HTMLElement | undefined;
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft) box.scrollTo({ left: left - 8, behavior: "smooth" });
    else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth)
      box.scrollTo({ left: left + el.offsetWidth - box.clientWidth + 8, behavior: "smooth" });
  }, [index]);
  return (
    <section aria-label={label} className="group relative">
      <div
        ref={row}
        onKeyDown={g.onKeyDown}
        // Room for the picked image's ring, which the scrolling row would clip.
        className="scroll-quiet flex gap-2 overflow-x-auto p-0.5 pb-1.5"
      >
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => g.click(i)}
            aria-label={`Image ${i + 1}${img.nsfw ? " (NSFW)" : ""}`}
            aria-current={i === index || undefined}
            title={i === index ? "Click to view full screen" : undefined}
            className={cn(
              "relative h-[440px] shrink-0 overflow-hidden rounded-lg border bg-sunken transition-[border-color,box-shadow] focus-ring max-lg:h-72",
              i === index
                ? "border-transparent ring-2 ring-accent"
                : "border-line hover:border-line-strong",
            )}
            style={{ aspectRatio: String(ratioOf(img)) }}
          >
            <Picture img={img} veiled={g.veiled(i)} large />
          </button>
        ))}
      </div>
      {images.length > 1 ? (
        <>
          <IconButton
            icon="chevron-left"
            label="Previous image"
            variant="secondary"
            size="sm"
            onClick={() => g.go(-1)}
            className={cn(ARROW, "left-2")}
          />
          <IconButton
            icon="chevron-right"
            label="Next image"
            variant="secondary"
            size="sm"
            onClick={() => g.go(1)}
            className={cn(ARROW, "right-2")}
          />
        </>
      ) : null}
      {g.viewer}
    </section>
  );
}

/** The picked image large, thumbnails down its side, and how it was made beside it. */
export function Split(props: LookProps) {
  const { images, label, index } = props;
  const g = useGallery(props);
  const current = images[index];
  if (!current) return null;
  return (
    <div className="flex gap-4 max-lg:flex-col">
      <section
        aria-label={label}
        onKeyDown={g.onKeyDown}
        className="flex min-w-0 shrink-0 gap-2 max-lg:flex-col-reverse"
      >
        {images.length > 1 ? (
          <div className="scroll-quiet flex max-h-[600px] w-15 shrink-0 flex-col gap-1.5 overflow-y-auto p-0.5 max-lg:max-h-none max-lg:w-auto max-lg:flex-row max-lg:overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => (i === index ? undefined : g.click(i))}
                aria-label={`Image ${i + 1}${img.nsfw ? " (NSFW)" : ""}`}
                aria-current={i === index || undefined}
                className={cn(
                  "relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-md border bg-sunken focus-ring",
                  i === index
                    ? "border-transparent ring-2 ring-accent"
                    : "border-line opacity-70 hover:opacity-100",
                )}
              >
                <img
                  src={img.thumb}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "h-full w-full object-cover",
                    g.veiled(i) && "scale-125 blur-md saturate-50",
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="group relative h-[600px] max-w-full overflow-hidden rounded-xl border border-line bg-sunken max-lg:h-auto max-lg:w-full"
          style={{ aspectRatio: String(ratioOf(current)) }}
        >
          <button
            type="button"
            onClick={() => g.click(index)}
            aria-label={g.veiled(index) ? "NSFW: click to reveal" : "View full screen"}
            className="absolute inset-0 cursor-zoom-in focus-ring"
          >
            <Picture img={current} veiled={g.veiled(index)} fit="contain" large />
          </button>
          {images.length > 1 ? (
            <>
              <IconButton
                icon="chevron-left"
                label="Previous image"
                variant="secondary"
                size="sm"
                onClick={() => g.go(-1)}
                className={cn(ARROW, "left-2")}
              />
              <IconButton
                icon="chevron-right"
                label="Next image"
                variant="secondary"
                size="sm"
                onClick={() => g.go(1)}
                className={cn(ARROW, "right-2")}
              />
            </>
          ) : null}
          <Count index={index} count={images.length} />
        </div>
      </section>
      <div className="min-w-0 flex-1">
        {current.meta ? (
          <ImageSettings meta={current.meta} />
        ) : (
          <Panel className="flex items-center gap-2 p-5 text-sm text-fg-3">
            <Icon name="info" size={15} className="shrink-0" />
            Its poster didn't share how this image was made.
          </Panel>
        )}
      </div>
      {g.viewer}
    </div>
  );
}

const GRID_FIRST = 8;

/** Every image in columns at its own shape; the first few until "Show all". */
export function Grid(props: LookProps) {
  const { images, label, index } = props;
  const g = useGallery(props);
  const [all, setAll] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fold again for new images
  useEffect(() => setAll(false), [images]);
  const shown = all ? images : images.slice(0, GRID_FIRST);
  return (
    <section aria-label={label} className="flex flex-col items-center gap-2">
      <div onKeyDown={g.onKeyDown} className="w-full columns-4 gap-2 max-lg:columns-2">
        {shown.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => g.click(i)}
            aria-label={`Image ${i + 1}${img.nsfw ? " (NSFW)" : ""}`}
            aria-current={i === index || undefined}
            title={i === index ? "Click to view full screen" : undefined}
            className={cn(
              "relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg border bg-sunken transition-[border-color,box-shadow] focus-ring",
              i === index
                ? "border-transparent ring-2 ring-accent"
                : "border-line hover:border-line-strong",
            )}
            style={{ aspectRatio: String(ratioOf(img)) }}
          >
            <Picture img={img} veiled={g.veiled(i)} />
          </button>
        ))}
      </div>
      {images.length > GRID_FIRST && !all ? (
        <Button variant="ghost" icon="chevron-down" onClick={() => setAll(true)}>
          Show all {images.length} images
        </Button>
      ) : null}
      {g.viewer}
    </section>
  );
}
