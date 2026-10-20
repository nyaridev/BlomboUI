import type { ViewId } from "@shared/constants";
import { useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useState } from "react";
import { useSession } from "./session";

/** Width of an element, kept current with ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
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
