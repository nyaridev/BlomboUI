/**
 * An image that shows its small picture at once and swaps in the large one once that's
 * downloaded and decoded off the main thread: no empty box while it loads, no freeze as a big
 * picture lands. The large one is fetched only when the image is near the screen and its box is
 * wider or taller (in device pixels) than the small one; leaving or unmounting cancels its
 * download.
 * Every large Civitai picture (a `full`, a description image) goes through this (or `useSharp`).
 */
import { cn } from "@client/lib/cn";
import { type RefObject, useEffect, useRef, useState } from "react";

/** The small picture's width: Civitai's `thumb` (`THUMB_WIDTH` on the server). */
export const SMALL_IMAGE_WIDTH = 450;

/** The small picture's size; `height` null when only its width is known. */
export interface SmallSize {
  width: number;
  height: number | null;
}

/**
 * True once `src` is loaded and decoded: started only when `el` is within 200 px of `root` (the
 * viewport by default) and wider or taller in device pixels than `small`;
 * `small` null waits (its size isn't known yet).
 */
export function useSharp(
  src: string,
  el: RefObject<HTMLElement | null>,
  root?: RefObject<HTMLElement | null>,
  small: SmallSize | null = { width: SMALL_IMAGE_WIDTH, height: null },
): boolean {
  const [ready, setReady] = useState<string | null>(null);
  const smallW = small?.width ?? null;
  const smallH = small?.height ?? null;
  useEffect(() => {
    const node = el.current;
    if (!node || smallW === null) return;
    const dpr = window.devicePixelRatio;
    const wider = node.clientWidth * dpr > smallW;
    const taller = smallH !== null && node.clientHeight * dpr > smallH;
    if (!wider && !taller) return;
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
      { root: root?.current ?? null, rootMargin: "200px" },
    );
    io.observe(node);
    return () => {
      live = false;
      io.disconnect();
      // Stops a download that hasn't finished.
      if (img && !img.complete) img.src = "";
    };
  }, [src, el, root, smallW, smallH]);
  return ready === src;
}

export function SharpImage({
  small,
  large,
  alt = "",
  fit = "cover",
  className,
}: {
  small: string;
  large: string;
  alt?: string;
  /**
   * `cover` / `contain` fill the box (give it a size); `width` is as wide as the box and as tall
   * as the picture (a description image).
   */
  fit?: "cover" | "contain" | "width";
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // The small picture's real size, once it's loaded: a tall box can need the large one even
  // when it's narrower than the small one.
  const [size, setSize] = useState<(SmallSize & { src: string }) | null>(null);
  const sharp = useSharp(large, ref, undefined, size?.src === small ? size : null);
  const fill = fit === "contain" ? "object-contain" : "object-cover";
  return (
    <span ref={ref} className={cn("relative block overflow-hidden", className)}>
      <img
        src={small}
        alt={alt}
        decoding="async"
        draggable={false}
        onLoad={(e) =>
          setSize({
            src: small,
            width: e.currentTarget.naturalWidth,
            height: e.currentTarget.naturalHeight,
          })
        }
        className={
          fit === "width" ? "block h-auto w-full" : cn("absolute inset-0 h-full w-full", fill)
        }
      />
      {sharp ? (
        // Already decoded: showing it costs nothing. The same box, so nothing moves.
        <img
          src={large}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("absolute inset-0 h-full w-full", fill)}
        />
      ) : null}
    </span>
  );
}
