/**
 * File Info's Civitai images: one row at the same height, each image at its own shape, scrolled
 * sideways. A click picks the image whose settings show below; a click on the picked one opens
 * it full screen; ← → move; NSFW images stay blurred until clicked.
 *
 * Big images are slow (Civitai makes them on first ask) and decoding one froze the page for a few
 * frames, so a tile shows the small picture at once and swaps in the large one only when it's on
 * screen, needs the pixels, and has been decoded off the main thread (`img.decode()`).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { IconButton, ImageViewer } from "@client/ui";
import type { CivitaiImage } from "@shared/civitai";
import { type RefObject, useEffect, useRef, useState } from "react";

/** The small picture's width (`THUMB_WIDTH` on the server); wider tiles want the large one. */
const SMALL_WIDTH = 450;

const ratioOf = (img: CivitaiImage) => (img.width && img.height ? img.width / img.height : 2 / 3);

export function Filmstrip({
  images,
  label,
  blurNsfw,
  index,
  onIndex,
}: {
  images: CivitaiImage[];
  label: string;
  blurNsfw: boolean;
  index: number;
  onIndex: (index: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [viewing, setViewing] = useState(false);
  const count = images.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: forget reveals for new images
  useEffect(() => setRevealed(new Set()), [images]);
  const veiled = (i: number) => Boolean(images[i]?.nsfw && blurNsfw && !revealed.has(i));
  const go = (delta: number) => count && onIndex((index + delta + count) % count);
  const click = (i: number) => {
    if (veiled(i)) setRevealed((r) => new Set(r).add(i));
    else if (i === index) setViewing(true);
    onIndex(i);
  };

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
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          go(e.key === "ArrowRight" ? 1 : -1);
        }}
        // Room for the picked image's ring, which the scrolling row would clip.
        className="scroll-quiet flex gap-2 overflow-x-auto p-0.5 pb-1.5"
      >
        {images.map((img, i) => (
          <Tile
            key={i}
            img={img}
            n={i + 1}
            picked={i === index}
            veiled={veiled(i)}
            row={row}
            onClick={() => click(i)}
          />
        ))}
      </div>
      {count > 1 ? (
        <>
          <IconButton
            icon="chevron-left"
            label="Previous image"
            variant="secondary"
            size="sm"
            onClick={() => go(-1)}
            className={cn(ARROW, "left-2")}
          />
          <IconButton
            icon="chevron-right"
            label="Next image"
            variant="secondary"
            size="sm"
            onClick={() => go(1)}
            className={cn(ARROW, "right-2")}
          />
        </>
      ) : null}
      {viewing ? (
        <ImageViewer
          images={images.map((im, i) => ({ key: String(i), src: im.full, alt: "" }))}
          index={index}
          onIndex={onIndex}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </section>
  );
}

const ARROW =
  "absolute top-1/2 z-10 -translate-y-1/2 rounded-md shadow-pop opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

function Tile({
  img,
  n,
  picked,
  veiled,
  row,
  onClick,
}: {
  img: CivitaiImage;
  n: number;
  picked: boolean;
  veiled: boolean;
  row: RefObject<HTMLDivElement | null>;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const sharp = useSharp(img.full, ref, row);
  const blur = veiled && "scale-110 blur-xl saturate-50";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Image ${n}${img.nsfw ? " (NSFW)" : ""}`}
      aria-current={picked || undefined}
      title={picked ? "Click to view full screen" : undefined}
      className={cn(
        "relative h-[440px] shrink-0 overflow-hidden rounded-lg border bg-sunken transition-[border-color,box-shadow] focus-ring max-lg:h-72",
        picked ? "border-transparent ring-2 ring-accent" : "border-line hover:border-line-strong",
      )}
      style={{ aspectRatio: String(ratioOf(img)) }}
    >
      <img
        src={img.thumb}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn("absolute inset-0 h-full w-full object-cover", blur)}
      />
      {sharp ? (
        // Already decoded: showing it costs nothing.
        <img
          src={img.full}
          alt=""
          draggable={false}
          className={cn("absolute inset-0 h-full w-full object-cover", blur)}
        />
      ) : null}
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
    </button>
  );
}

/**
 * True once the large picture is loaded and decoded: started only when the tile is near the
 * visible part of the row and is wider (in device pixels) than the small picture. Leaving or
 * unmounting cancels the download.
 */
function useSharp(
  src: string,
  tile: RefObject<HTMLElement | null>,
  row: RefObject<HTMLElement | null>,
): boolean {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    const el = tile.current;
    if (!el || el.clientWidth * window.devicePixelRatio <= SMALL_WIDTH * 1.15) return;
    let img: HTMLImageElement | null = null;
    let live = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || img) return;
        io.disconnect();
        img = new Image();
        img.decoding = "async";
        img.src = src;
        img
          .decode()
          .then(() => live && setReady(src))
          .catch(() => undefined);
      },
      { root: row.current, rootMargin: "0px 300px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
      // Stops a download that hasn't finished.
      if (img && !img.complete) img.src = "";
    };
  }, [src, tile, row]);
  return ready === src;
}
