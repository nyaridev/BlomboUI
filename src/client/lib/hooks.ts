import type { ViewId } from "@shared/constants";
import { useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "./session";

/**
 * Width of an element's content box, kept current with ResizeObserver. The first value is read
 * before paint, so a grid sized from it never shows a frame at width 0 (one full-width column).
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(el);
    setWidth(
      Math.floor(el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)),
    );
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard focus for a modal layer that isn't a ui/Dialog (the lightbox, the tour): focus moves
 * into it when it opens, Tab and Shift+Tab stay inside it, and focus goes back to where it was
 * when it closes.
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open = true): void {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const items = () =>
      el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => !n.hidden) : [];
    if (el && !el.contains(document.activeElement)) (items()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const list = items();
      if (!list.length) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      const inside = el.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (before?.isConnected) before.focus();
    };
  }, [ref, open]);
}

/** Window keyboard listener that ignores typing in inputs. */
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === key) handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, enabled]);
}

/** Go to a view of the open profile ("models", "history"…), from anywhere in the app. */
export function useGoToView(): (view: ViewId) => void {
  const navigate = useNavigate();
  return (view) => {
    const profileId = useSession.getState().profileId;
    if (!profileId) return;
    if (view === "generate") void navigate({ to: "/p/$profileId", params: { profileId } });
    else void navigate({ to: "/p/$profileId/$view", params: { profileId, view } });
  };
}

/** `value`, once it has stopped changing for `ms` (for requests that follow typing or sliders). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

// Tailwind's `lg` breakpoint: below it the layout is the compact one (`max-lg:` classes) that
// phones, tablets and narrow windows get.
const COMPACT = "(max-width: 1023.98px)";

/** True below 1024px, for layouts CSS alone can't switch (a sidebar becoming a Sheet). */
export function useCompact(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(COMPACT);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => matchMedia(COMPACT).matches,
  );
}
