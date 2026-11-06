/**
 * Paint a mask over an image (inpaint): a brush and an eraser in image pixels, undo, invert and
 * clear. The mask lives in an offscreen canvas at the image's own size, as white ink whose alpha
 * is the mask; the visible canvas shows it tinted with the accent. `toBlob()` (through `ref`)
 * gives the opaque black-and-white PNG to save (white = redraw). Keys while it's on screen:
 * [ and ] change the brush, X swaps brush and eraser, Ctrl+Z undoes.
 */
import { cn } from "@client/lib/cn";
import {
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { IconButton } from "./Button";
import { defaultBrush, hasInk, inkToMask, invertInk, maskToInk, toImagePoint } from "./mask";
import { Slider } from "./Slider";
import { Segmented } from "./toggles";

/** Mask data, not a UI color: LoadImageMask reads white as "redraw". */
const INK = "rgb(255 255 255)";
const UNDO_STEPS = 12;

const inkOf = (canvas: HTMLCanvasElement | null) =>
  canvas?.getContext("2d", { willReadFrequently: true }) ?? null;

export interface MaskPainterHandle {
  /** The mask as an opaque black-and-white PNG at the image's size. */
  toBlob(): Promise<Blob | null>;
  isEmpty(): boolean;
}

type Tool = "brush" | "eraser";

export function MaskPainter({
  src,
  width,
  height,
  initialMask,
  maxHeight = "60vh",
  ref,
  onChange,
  className,
}: {
  src: string;
  /** The image's own size; the mask is painted and saved at it. */
  width: number;
  height: number;
  /** A saved mask to keep painting on. */
  initialMask?: string | null;
  maxHeight?: string;
  ref?: Ref<MaskPainterHandle>;
  /** After each stroke, undo, invert or clear: whether anything is painted. */
  onChange?: (painted: boolean) => void;
  className?: string;
}) {
  const view = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const undo = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(() => defaultBrush(width, height));
  const [cursor, setCursor] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const maxBrush = Math.max(16, Math.round(Math.min(width, height) / 4));

  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const canvas = view.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !mask.current) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(mask.current, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--accent").trim() || INK;
      ctx.fillRect(0, 0, width, height);
    });
  }, [width, height]);

  const changed = useCallback(() => {
    redraw();
    const c = inkOf(mask.current);
    if (c && onChange) onChange(hasInk(c.getImageData(0, 0, width, height).data));
  }, [redraw, onChange, width, height]);

  // A fresh mask canvas for each image (and the saved mask, when there is one).
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    mask.current = canvas;
    undo.current = [];
    setCanUndo(false);
    setBrush(defaultBrush(width, height));
    redraw();
    if (!initialMask) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      const c = canvas.getContext("2d", { willReadFrequently: true });
      if (!live || !c) return;
      c.drawImage(img, 0, 0, width, height);
      const data = c.getImageData(0, 0, width, height);
      maskToInk(data.data);
      c.putImageData(data, 0, 0);
      redraw();
    };
    img.src = initialMask;
    return () => {
      live = false;
    };
  }, [width, height, initialMask, redraw]);

  useImperativeHandle(ref, () => ({
    toBlob: async () => {
      const c = inkOf(mask.current);
      if (!c) return null;
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const o = out.getContext("2d");
      if (!o) return null;
      const data = c.getImageData(0, 0, width, height);
      inkToMask(data.data);
      o.putImageData(data, 0, 0);
      return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
    },
    isEmpty: () => {
      const c = inkOf(mask.current);
      return !c || !hasInk(c.getImageData(0, 0, width, height).data);
    },
  }));

  const snapshot = () => {
    const c = inkOf(mask.current);
    if (!c) return;
    undo.current = [...undo.current, c.getImageData(0, 0, width, height)].slice(-UNDO_STEPS);
    setCanUndo(true);
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = inkOf(mask.current);
    if (!c) return;
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = brush;
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    c.globalCompositeOperation = "source-over";
    redraw();
  };

  const point = (e: PointerEvent) => {
    const rect = view.current?.getBoundingClientRect();
    return rect ? toImagePoint(e.clientX, e.clientY, rect, width, height) : null;
  };

  const track = (e: PointerEvent) => {
    const rect = view.current?.getBoundingClientRect();
    if (rect)
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, scale: rect.width / width });
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = point(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    last.current = p;
    stroke(p, p);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    track(e);
    if (!last.current) return;
    const p = point(e);
    if (!p) return;
    stroke(last.current, p);
    last.current = p;
  };
  const onUp = () => {
    if (!last.current) return;
    last.current = null;
    changed();
  };

  const doUndo = () => {
    const c = inkOf(mask.current);
    const prev = undo.current.at(-1);
    if (!c || !prev) return;
    undo.current = undo.current.slice(0, -1);
    c.putImageData(prev, 0, 0);
    setCanUndo(undo.current.length > 0);
    changed();
  };
  const transform = (fn: (px: Uint8ClampedArray) => void) => {
    const c = inkOf(mask.current);
    if (!c) return;
    snapshot();
    const data = c.getImageData(0, 0, width, height);
    fn(data.data);
    c.putImageData(data, 0, 0);
    changed();
  };
  const clear = () =>
    transform((px) => {
      for (let i = 3; i < px.length; i += 4) px[i] = 0;
    });

  // Keys work while the painter is on screen (the canvas can't hold focus), never while typing.
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, [contenteditable=true]")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      const step = Math.max(1, Math.round(brush * 0.15));
      setBrush((b) => Math.min(maxBrush, Math.max(1, b + (e.key === "]" ? step : -step))));
    } else if (e.key.toLowerCase() === "x" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setTool((t) => (t === "brush" ? "eraser" : "brush"));
    }
  };
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Tool"
          value={tool}
          onChange={setTool}
          options={[
            { value: "brush", label: "Brush", icon: "edit", title: "Brush (X swaps)" },
            { value: "eraser", label: "Eraser", icon: "eraser", title: "Eraser (X swaps)" },
          ]}
        />
        <Slider
          ariaLabel="Brush size"
          size="sm"
          value={brush}
          onChange={setBrush}
          min={1}
          max={maxBrush}
          unit="px"
          className="w-48"
        />
        <span className="ml-auto flex items-center gap-0.5">
          <IconButton
            icon="undo"
            label="Undo"
            shortcut="Ctrl+Z"
            disabled={!canUndo}
            onClick={doUndo}
          />
          <IconButton
            icon="swap-horizontal"
            label="Invert the mask"
            onClick={() => transform(invertInk)}
          />
          <IconButton icon="trash" label="Clear the mask" onClick={clear} />
        </span>
      </div>
      <div
        className="relative mx-auto overflow-hidden rounded-md border border-line bg-sunken"
        style={{
          width: `min(100%, calc(${maxHeight} * ${width / height}))`,
          aspectRatio: `${width} / ${height}`,
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
        />
        <canvas
          ref={view}
          width={width}
          height={height}
          role="img"
          aria-label="The mask: painted parts are redrawn"
          className="absolute inset-0 h-full w-full cursor-none touch-none opacity-55"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setCursor(null)}
        />
        {cursor ? (
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-full border border-fg shadow-pop"
            style={{
              left: cursor.x,
              top: cursor.y,
              width: brush * cursor.scale,
              height: brush * cursor.scale,
              transform: "translate(-50%, -50%)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
