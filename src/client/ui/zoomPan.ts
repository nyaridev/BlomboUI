/**
 * Zoom and drag for a picture viewer (`ImageViewer`, the gallery's lightbox): the wheel on the
 * picture zooms around the pointer (1× to 8×, easing over 140 ms); while zoomed in, the wheel
 * anywhere in `root` zooms, and a drag moves the picture. A double click fits it again. Wheel
 * turns that don't zoom (beside a fitted picture) go to `elsewhere`, for stepping through images.
 */
import { clamp } from "@client/lib/number";
import {
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ZoomView {
  scale: number;
  x: number;
  y: number;
}
export const FIT: ZoomView = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;

/** The view after a wheel turn at a point, `dx`/`dy` from the picture's center (pure). */
export function zoomAt(v: ZoomView, deltaY: number, dx: number, dy: number): ZoomView {
  const scale = clamp(v.scale * Math.exp(-deltaY * 0.002), 1, MAX_ZOOM);
  if (scale === 1) return FIT;
  // Keep the point under the pointer still.
  return {
    scale,
    x: dx - ((dx - v.x) * scale) / v.scale,
    y: dy - ((dy - v.y) * scale) / v.scale,
  };
}

export function useZoomPan(
  root: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  elsewhere?: (e: WheelEvent) => void,
) {
  const [view, setView] = useState<ZoomView>(FIT);
  const [dragging, setDragging] = useState(false);
  // The wheel listener is native (it must preventDefault), so it reads the latest values here.
  const live = useRef({ view, elsewhere });
  live.current = { view, elsewhere };
  const drag = useRef<{ id: number; x: number; y: number; from: ZoomView } | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pic = target.current;
      const v = live.current.view;
      const onPicture = Boolean(pic && e.target instanceof Node && pic.contains(e.target));
      if (!pic || !(onPicture || v.scale > 1)) {
        live.current.elsewhere?.(e);
        return;
      }
      // The transform scales around the box's center; read it from the layout (the on-screen
      // box is mid-animation while zoom eases).
      const parent = (pic.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      if (!parent) return;
      const cx = parent.left + pic.offsetLeft + pic.offsetWidth / 2;
      const cy = parent.top + pic.offsetTop + pic.offsetHeight / 2;
      setView(zoomAt(v, e.deltaY, e.clientX - cx, e.clientY - cy));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [root, target]);

  const zoomed = view.scale > 1;
  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!zoomed || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: view };
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      setView({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y });
    },
    onPointerUp: end,
    onPointerCancel: end,
    onDoubleClick: () => setView(FIT),
  };
  const style: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
    // The old app's feel: zoom eases over 140 ms, a drag follows the pointer exactly.
    transition: dragging ? "none" : "transform 140ms ease-out",
    willChange: "transform",
    cursor: "all-scroll",
  };
  return { view, setView, zoomed, handlers, style };
}
