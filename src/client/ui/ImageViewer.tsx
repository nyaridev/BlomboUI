/**
 * A full-screen look at one image, or a few (a run's results): the picture as large as it fits
 * between equal top and bottom margins, over the page dimmed and blurred. Esc or a click beside
 * the picture closes it; ← →, the side buttons or the wheel beside the picture step through the
 * images (a wheel notch is one image). The wheel on the picture zooms around the pointer (easing) and a drag moves it;
 * while zoomed in, the wheel anywhere zooms, so it only steps again once the picture is back to
 * its size. A middle click on the picture opens it in a new tab (`onOpenTab`); `actions` puts buttons for the image on screen beside Close. It sits on the
 * lightbox layer (z 250).
 *
 * An image with a `preview` (a small picture already loaded, such as a thumbnail) and its size
 * shows the preview at once, in the box the large picture will have, and swaps the large one into
 * the same element once it's downloaded and decoded: no empty wait, no jump, zoom and drag kept.
 */

import { useModalFocus } from "@client/lib/hooks";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { IconButton } from "./Button";
import { FIT, useZoomPan } from "./zoomPan";

export interface ViewerImage {
  key: string;
  src: string;
  alt: string;
  /** A small picture to show until `src` is ready (needs `width` and `height`). */
  preview?: string;
  /** The large picture's size in pixels, so the preview fills the box it will have. */
  width?: number | null;
  height?: number | null;
}

/** Trackpads send small pixel steps: they add up to one image per this many pixels. */
const TRACKPAD_STEP = 100;
const ON_DARK = "bg-black/30 text-white/85 hover:bg-black/50 hover:text-white";

export function ImageViewer({
  images,
  index,
  onIndex,
  onClose,
  onOpenTab,
  actions,
}: {
  images: ViewerImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onOpenTab?: (image: ViewerImage) => void;
  /** Buttons for the image on screen, in the top right beside Close (Add to gallery). */
  actions?: (index: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  useModalFocus(ref);
  const image = images[index] ?? images[0];
  const many = images.length > 1;
  // The wheel steps images through a native listener, so it reads the latest values here.
  const live = useRef({ index, count: images.length, wheel: 0 });
  live.current.index = index;
  live.current.count = images.length;
  const { setView, handlers, style } = useZoomPan(ref, imgRef, (e) => {
    const { count } = live.current;
    const delta = e.deltaY || e.deltaX;
    if (count < 2 || delta === 0) return;
    // A mouse wheel notch is one image, however fast it turns; a trackpad adds up.
    const notch = e.deltaMode !== 0 || Math.abs(delta) >= 50;
    if (!notch) {
      live.current.wheel += delta;
      if (Math.abs(live.current.wheel) < TRACKPAD_STEP) return;
    }
    const dir = (notch ? delta : live.current.wheel) > 0 ? 1 : -1;
    live.current.wheel = 0;
    // Count from the image just stepped to, before React has re-rendered.
    live.current.index = (live.current.index + dir + count) % count;
    onIndex(live.current.index);
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState<string | null>(null);
  const progressive = Boolean(image?.preview && image.width && image.height);

  // The stage's size, for the preview's box: read before the first paint, then on resize.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load and decode the large picture off the main thread, then swap it in.
  // Keyed by the address: callers often build the image list anew on every render.
  const large = progressive ? image?.src : undefined;
  useEffect(() => {
    if (!large) return;
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.src = large;
    // A failed decode still swaps: the <img> then shows whatever the browser can.
    const done = () => live && setReady(large);
    img.decode().then(done, done);
    return () => {
      live = false;
      if (!img.complete) img.src = "";
    };
  }, [large]);

  const step = (dir: 1 | -1) => {
    if (!many) return;
    onIndex((live.current.index + dir + images.length) % images.length);
  };

  // Another picture starts fitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the trigger
  useEffect(() => setView(FIT), [index, setView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        onIndex((index + dir + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, many, onClose, onIndex]);

  if (!image) return null;
  const middle = (e: MouseEvent) => {
    if (e.button !== 1 || !onOpenTab) return;
    e.preventDefault();
    onOpenTab(image);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      // The old app's backdrop: the theme's background at 75%, a medium blur.
      className="fixed inset-0 z-[250] overflow-hidden bg-bg/75 backdrop-blur-md"
    >
      {/* Equal margins top and bottom; the sides leave room for the step buttons. */}
      <div
        ref={stageRef}
        className="absolute inset-x-20 inset-y-10 flex items-center justify-center max-lg:inset-x-3"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={() => undefined}
      >
        <img
          ref={imgRef}
          src={progressive && ready !== image.src ? image.preview : image.src}
          alt={image.alt}
          draggable={false}
          onMouseDown={(e) => {
            // Keep the browser's autoscroll from starting on a middle click.
            if (e.button === 1) e.preventDefault();
          }}
          onAuxClick={middle}
          {...handlers}
          className="max-h-full max-w-full touch-none object-contain select-none"
          // The large picture's box, so the preview fills it and the swap doesn't move.
          style={{ ...(progressive ? boxFor(image, stage) : null), ...style }}
        />
      </div>
      {many ? (
        <>
          {/* Wrapped: the button is `relative` itself, so it can't take `absolute`. */}
          <div className="absolute top-1/2 left-4 -translate-y-1/2 max-lg:left-1">
            <IconButton
              icon="chevron-left"
              label="Previous image"
              shortcut="←"
              size="lg"
              onClick={() => step(-1)}
              className={ON_DARK}
            />
          </div>
          <div className="absolute top-1/2 right-4 -translate-y-1/2 max-lg:right-1">
            <IconButton
              icon="chevron-right"
              label="Next image"
              shortcut="→"
              size="lg"
              onClick={() => step(1)}
              className={ON_DARK}
            />
          </div>
        </>
      ) : null}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        {actions?.(images[index] ? index : 0)}
        <IconButton
          icon="x"
          label="Close"
          shortcut="Esc"
          onClick={onClose}
          className="text-fg-2 hover:text-fg"
        />
      </div>
    </div>
  );
}

/** The size the large picture shows at: fitted to the stage, never past its own pixels. */
function boxFor(image: ViewerImage, stage: { w: number; h: number }) {
  const w = image.width ?? 1;
  const h = image.height ?? 1;
  const scale = Math.min(1, stage.w / w, stage.h / h);
  return { width: w * scale, height: h * scale };
}
