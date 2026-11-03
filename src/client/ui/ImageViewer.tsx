/**
 * A full-screen look at one image, or a few (a run's results): the picture as large as it fits
 * between equal top and bottom margins, over the page dimmed and blurred. Esc or a click beside
 * the picture closes it; ← →, the side buttons or the wheel beside the picture step through the
 * images. The wheel on the picture zooms around the pointer and a drag moves it; while zoomed in,
 * the wheel anywhere zooms, so it only steps again once the picture is back to its size. A
 * middle click on the picture opens it in a new tab (`onOpenTab`). It sits on the lightbox layer
 * (z 250).
 */

import { useModalFocus } from "@client/lib/hooks";
import { clamp } from "@client/lib/number";
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";

export interface ViewerImage {
  key: string;
  src: string;
  alt: string;
}

const MAX_ZOOM = 8;
/** One wheel gesture steps one image (trackpads send many events per swipe). */
const STEP_GAP_MS = 350;
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
}: {
  images: ViewerImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onOpenTab?: (image: ViewerImage) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  useModalFocus(ref);
  const image = images[index] ?? images[0];
  const many = images.length > 1;
  const [view, setView] = useState<View>(FIT);
  // The wheel listener is native (it must preventDefault), so it reads the latest values here.
  const live = useRef({ view, index, count: images.length, lastStep: 0 });
  live.current.view = view;
  live.current.index = index;
  live.current.count = images.length;
  const drag = useRef<{ id: number; x: number; y: number; from: View } | null>(null);

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
        const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
        if (scale === 1) {
          setView(FIT);
          return;
        }
        // Keep the point under the pointer still: the box's center is where the picture sits
        // before it's moved, and the transform scales around it.
        const r = img.getBoundingClientRect();
        const cx = r.left + r.width / 2 - v.x;
        const cy = r.top + r.height / 2 - v.y;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        setView({
          scale,
          x: dx - ((dx - v.x) * scale) / v.scale,
          y: dy - ((dy - v.y) * scale) / v.scale,
        });
        return;
      }
      if (count < 2 || e.deltaY === 0) return;
      const now = performance.now();
      if (now - live.current.lastStep < STEP_GAP_MS) return;
      live.current.lastStep = now;
      onIndex((live.current.index + (e.deltaY > 0 ? 1 : -1) + count) % count);
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
  };
  const onPointerMove = (e: PointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      className="fixed inset-0 z-[250] overflow-hidden bg-black/55 backdrop-blur-xl"
    >
      {/* Equal margins top and bottom; the sides leave room for the step buttons. */}
      <div
        className="absolute inset-x-20 inset-y-10 flex items-center justify-center max-lg:inset-x-3"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={() => undefined}
      >
        <img
          ref={imgRef}
          src={image.src}
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
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            cursor: zoomed ? (drag.current ? "grabbing" : "grab") : "zoom-in",
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
      <div className="absolute top-3 right-3">
        <IconButton icon="x" label="Close" shortcut="Esc" onClick={onClose} className={ON_DARK} />
      </div>
    </div>
  );
}
