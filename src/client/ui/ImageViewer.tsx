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
import { clamp } from "@client/lib/number";
import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { IconButton } from "./Button";

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

const MAX_ZOOM = 8;
/** Trackpads send small pixel steps: they add up to one image per this many pixels. */
const TRACKPAD_STEP = 100;
const ON_DARK = "bg-black/30 text-white/85 hover:bg-black/50 hover:text-white";

interface View {
  scale: number;
  x: number;
  y: number;
}
const FIT: View = { scale: 1, x: 0, y: 0 };

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
  const [view, setView] = useState<View>(FIT);
  // The wheel listener is native (it must preventDefault), so it reads the latest values here.
  const live = useRef({ view, index, count: images.length, wheel: 0 });
  live.current.view = view;
  live.current.index = index;
  live.current.count = images.length;
  const drag = useRef<{ id: number; x: number; y: number; from: View } | null>(null);
  const [dragging, setDragging] = useState(false);
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
  useEffect(() => setView(FIT), [index]);

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

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      const { view: v, count } = live.current;
      const onImage = Boolean(img && e.target instanceof Node && img.contains(e.target));
      if (img && (onImage || v.scale > 1)) {
        const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.002), 1, MAX_ZOOM);
        if (scale === 1) {
          setView(FIT);
          return;
        }
        // Keep the point under the pointer still. The transform scales around the box's center;
        // read it from the layout (the on-screen box is mid-animation while zoom eases).
        const stage = img.parentElement?.getBoundingClientRect();
        if (!stage) return;
        const cx = stage.left + img.offsetLeft + img.offsetWidth / 2;
        const cy = stage.top + img.offsetTop + img.offsetHeight / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        setView({
          scale,
          x: dx - ((dx - v.x) * scale) / v.scale,
          y: dy - ((dy - v.y) * scale) / v.scale,
        });
        return;
      }
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
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [onIndex]);

  if (!image) return null;
  const middle = (e: MouseEvent) => {
    if (e.button !== 1 || !onOpenTab) return;
    e.preventDefault();
    onOpenTab(image);
  };
  const zoomed = view.scale > 1;

  const onPointerDown = (e: PointerEvent<HTMLImageElement>) => {
    if (!zoomed || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: view };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y });
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
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
          onDoubleClick={() => setView(FIT)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="max-h-full max-w-full touch-none object-contain select-none"
          style={{
            // The large picture's box, so the preview fills it and the swap doesn't move.
            ...(progressive ? boxFor(image, stage) : null),
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            // The old app's feel: zoom eases over 140 ms, a drag follows the pointer exactly.
            transition: dragging ? "none" : "transform 140ms ease-out",
            willChange: "transform",
            cursor: "all-scroll",
          }}
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
