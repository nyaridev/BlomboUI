/**
 * File Info's Civitai images as an endless carousel: the picked image sits in the middle at its
 * own shape, the others run off both sides and wrap around. A wheel notch moves one image; a
 * drag (with a fling) moves it freely and it settles on the nearest image; a click on a side
 * image brings it to the middle,
 * a click on the middle one opens it full screen; ← → step, Enter opens.
 *
 * Only the tiles near the viewport are rendered (the row is laid out as one cycle repeated), and
 * moving writes the track's transform directly, so React renders only when tiles come or go.
 * Each tile shows the small picture first and swaps in the large one when it's needed and has
 * been decoded off the main thread (big images used to freeze the page as they landed).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { IconButton, ImageViewer, Skeleton, useSharp } from "@client/ui";
import { type CivitaiImage, civitaiFullSize } from "@shared/civitai";
import { type AnimationPlaybackControls, animate } from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const GAP = 8;
/** Trackpad pixels that make one image's step (a mouse wheel notch is always one). */
const WHEEL_STEP = 100;
/** Pixels a press may move and still be a click. */
const SLOP = 5;
/** Extra width rendered past each edge, so tiles exist before they slide in. */
const OVERSCAN = 400;
/** The viewport's height: also what the placeholder uses, so nothing moves when images arrive. */
export const CAROUSEL_HEIGHT = "h-[440px] max-lg:h-72";

const ratioOf = (img: CivitaiImage) => (img.width && img.height ? img.width / img.height : 2 / 3);
const mod = (a: number, n: number) => ((a % n) + n) % n;

export function CivitaiCarousel({
  images,
  label,
  onIndex,
}: {
  images: CivitaiImage[];
  label: string;
  /** The image in the middle changed (once it settles). */
  onIndex: (index: number) => void;
}) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const n = images.length;
  const loop = n > 1;

  // One cycle of the row: each tile's width and where it starts.
  const layout = useMemo(() => {
    const widths = images.map((img) => size.h * ratioOf(img));
    const starts: number[] = [];
    let acc = 0;
    for (const w of widths) {
      starts.push(acc);
      acc += w + GAP;
    }
    return { widths, starts, cycle: acc };
  }, [images, size.h]);

  // Tile k of the endless row is image mod(k, n), one cycle further for every n.
  const geo = useMemo(() => {
    const leftOf = (k: number) =>
      Math.floor(k / n) * layout.cycle + (layout.starts[mod(k, n)] ?? 0);
    const widthOf = (k: number) => layout.widths[mod(k, n)] ?? 0;
    const centerOf = (k: number) => leftOf(k) + widthOf(k) / 2;
    const nearest = (x: number) => {
      if (!loop || layout.cycle <= 0) return 0;
      const base = Math.floor(x / layout.cycle) * n;
      let best = base;
      for (let k = base - 1; k <= base + n; k++)
        if (Math.abs(centerOf(k) - x) < Math.abs(centerOf(best) - x)) best = k;
      return best;
    };
    return { leftOf, widthOf, centerOf, nearest };
  }, [layout, n, loop]);

  /** Where the track is: the row's x under the middle of the viewport. */
  const pos = useRef(0);
  /** The tile it's heading for (or resting on). */
  const aim = useRef(0);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [settled, setSettled] = useState(0);
  const [viewing, setViewing] = useState(false);

  const place = useCallback(
    (x: number) => {
      pos.current = x;
      const el = track.current;
      if (el) el.style.transform = `translate3d(${size.w / 2 - x}px,0,0)`;
      const next: [number, number] = loop
        ? [geo.nearest(x - size.w / 2 - OVERSCAN) - 1, geo.nearest(x + size.w / 2 + OVERSCAN) + 1]
        : [0, 0];
      setRange((r) => (r[0] === next[0] && r[1] === next[1] ? r : next));
    },
    [geo, size.w, loop],
  );

  const settle = useCallback(() => {
    const k = geo.nearest(pos.current);
    aim.current = k;
    setSettled(k);
    onIndex(mod(k, n));
  }, [geo, n, onIndex]);

  const slideTo = useCallback(
    (k: number) => {
      aim.current = k;
      anim.current?.stop();
      anim.current = animate(pos.current, geo.centerOf(k), {
        type: "spring",
        stiffness: 320,
        damping: 36,
        onUpdate: place,
        onComplete: settle,
      });
    },
    [geo, place, settle],
  );

  // Measure the viewport.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // New images start on the first one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the images change
  useEffect(() => {
    aim.current = 0;
    setSettled(0);
    onIndex(0);
  }, [images]);

  // Keep the aimed tile in the middle when the size or the images change.
  useEffect(() => {
    anim.current?.stop();
    place(geo.centerOf(aim.current));
  }, [geo, place]);

  // A wheel notch moves one image; a trackpad's small steps add up to one image per WHEEL_STEP
  // pixels. The listener is native because it must cancel the page's scroll.
  useEffect(() => {
    const el = view.current;
    if (!el || !loop) return;
    let acc = 0;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      const notch = e.deltaMode !== 0 || Math.abs(d) >= WHEEL_STEP / 2;
      acc = notch ? 0 : acc + d;
      if (notch || Math.abs(acc) >= WHEEL_STEP) {
        slideTo(aim.current + Math.sign(notch ? d : acc));
        acc = 0;
      }
      // A pause forgets a half-made trackpad step.
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        acc = 0;
      }, 200);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(quiet);
    };
  }, [loop, slideTo]);

  const step = (d: number) => slideTo(aim.current + d);
  const open = (k: number) => {
    if (k === settled || !loop) setViewing(true);
    else slideTo(k);
  };

  // A press: a drag moves the row (a fling carries on), a click opens or centers a tile.
  const press = useRef<{
    id: number;
    x0: number;
    pos0: number;
    moved: boolean;
    samples: Array<[number, number]>;
  } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    anim.current?.stop();
    press.current = {
      id: e.pointerId,
      x0: e.clientX,
      pos0: pos.current,
      moved: false,
      samples: [[e.timeStamp, e.clientX]],
    };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || !loop) return;
    const dx = e.clientX - p.x0;
    if (!p.moved) {
      if (Math.abs(dx) < SLOP) return;
      p.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    place(p.pos0 - dx);
    p.samples.push([e.timeStamp, e.clientX]);
    if (p.samples.length > 6) p.samples.shift();
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved) {
      const k = Number((e.target as Element).closest<HTMLElement>("[data-k]")?.dataset.k);
      if (Number.isFinite(k)) open(k);
      return;
    }
    // Speed over the last moves, in px/ms: the row glides on a little before it settles.
    const [t0, x0] = p.samples[0] ?? [e.timeStamp, e.clientX];
    const v = (e.clientX - x0) / Math.max(1, e.timeStamp - t0);
    slideTo(geo.nearest(pos.current - v * 220));
  };

  const tiles: number[] = [];
  for (let k = range[0]; k <= range[1]; k++) tiles.push(k);
  const picked = mod(settled, n);

  return (
    <section aria-roledescription="carousel" aria-label={label} className="group relative">
      <div
        ref={view}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the carousel takes arrow keys while focused
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            if (loop) step(e.key === "ArrowRight" ? 1 : -1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            open(settled);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          slideTo(geo.nearest(pos.current));
        }}
        className={cn(
          "relative touch-pan-y overflow-hidden rounded-xl select-none focus-ring",
          loop && "cursor-grab active:cursor-grabbing",
          CAROUSEL_HEIGHT,
        )}
      >
        <div ref={track} className="absolute inset-y-0 left-0 will-change-transform">
          {tiles.map((k) => {
            const i = mod(k, n);
            const img = images[i];
            if (!img) return null;
            return (
              <Tile
                key={k}
                k={k}
                img={img}
                left={geo.leftOf(k)}
                width={geo.widthOf(k)}
                picked={k === settled}
                view={view}
              />
            );
          })}
        </div>
        <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-xs bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular">
          {picked + 1} / {n}
        </span>
      </div>
      {loop ? (
        <>
          {/* Wrapped: IconButton's own `relative` would beat `absolute`. */}
          <span className={cn(ARROW, "left-2")}>
            <IconButton
              icon="chevron-left"
              label="Previous image"
              variant="secondary"
              size="sm"
              onClick={() => step(-1)}
              className="rounded-md shadow-pop"
            />
          </span>
          <span className={cn(ARROW, "right-2")}>
            <IconButton
              icon="chevron-right"
              label="Next image"
              variant="secondary"
              size="sm"
              onClick={() => step(1)}
              className="rounded-md shadow-pop"
            />
          </span>
        </>
      ) : null}
      <span className="sr-only" aria-live="polite">
        Image {picked + 1} of {n}
      </span>
      {viewing ? (
        <ImageViewer
          images={images.map((im, i) => ({
            key: String(i),
            src: im.full,
            alt: "",
            // The carousel's small picture is already loaded: it shows until the large one is.
            preview: im.thumb,
            ...civitaiFullSize(im),
          }))}
          index={picked}
          onIndex={(i) => {
            const k = aim.current - mod(aim.current, n) + i;
            anim.current?.stop();
            place(geo.centerOf(k));
            settle();
          }}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </section>
  );
}

const ARROW =
  "absolute top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100";

function Tile({
  k,
  img,
  left,
  width,
  picked,
  view,
}: {
  k: number;
  img: CivitaiImage;
  left: number;
  width: number;
  picked: boolean;
  view: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const sharp = useSharp(img.full, ref, view);
  return (
    <div
      ref={ref}
      data-k={k}
      className={cn(
        "absolute inset-y-0 overflow-hidden rounded-lg border bg-sunken transition-[opacity,border-color,box-shadow] duration-200",
        picked ? "border-transparent ring-2 ring-accent ring-inset" : "border-line opacity-60",
      )}
      style={{ left, width }}
    >
      {loaded ? null : <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        src={img.thumb}
        alt=""
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {sharp ? (
        // Already decoded: showing it costs nothing.
        <img
          src={img.full}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {img.video ? (
        <span className="absolute bottom-2 left-2 inline-flex h-5 items-center gap-1 rounded-xs bg-black/60 px-1.5 text-[10px] font-semibold text-white">
          <Icon name="play" size={10} />
          First frame
        </span>
      ) : null}
    </div>
  );
}

/** The carousel's place while Civitai is searched: the same height, so nothing moves after. */
export function CarouselPlaceholder({ message }: { message: string }) {
  return (
    <div
      className={cn(
        "relative flex items-stretch justify-center gap-2 overflow-hidden rounded-xl",
        CAROUSEL_HEIGHT,
      )}
    >
      {/* The middle one stands out, like the picked image will. */}
      {[false, true, false].map((middle, i) => (
        <div key={i} className={cn("aspect-[2/3] h-full shrink-0", !middle && "opacity-60")}>
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      ))}
      <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md bg-surface-3 px-3 py-1.5 text-sm text-fg-2 shadow-pop">
        <Icon name="refresh" size={14} className="animate-spin text-accent-ink" />
        {message}
      </span>
    </div>
  );
}
