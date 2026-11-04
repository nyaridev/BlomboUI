/** Which sampling steps the image stage shows a preview for (Settings → Generate → Preview). */
import type { PreviewSettings } from "@shared/settings";
import { create } from "zustand";

/**
 * Show the preview that came with `step` of `max`? `wait` is true while the first preview of a
 * run should wait for `after` steps (the first part of the first run of a click).
 */
export function previewDue(step: number, max: number, p: PreviewSettings, wait: boolean): boolean {
  if (!p.show || step < 1) return false;
  if (p.lastStep && step >= max) return true;
  if (step % p.every !== 0) return false;
  return !wait || step >= p.after;
}

/**
 * The jobs the last Generate click queued, in run order. The image stage shows them as one
 * run (the strip under the image); anything else (Loop, a re-run from History) is a run alone.
 */
export const useLastRun = create<{ ids: string[]; set: (ids: string[]) => void }>((set) => ({
  ids: [],
  set: (ids) => set({ ids }),
}));

/** The result the image stage shows (its URL), for "Preview from the image in Generate". */
export const useShownImage = create<{ url: string | null }>(() => ({ url: null }));
