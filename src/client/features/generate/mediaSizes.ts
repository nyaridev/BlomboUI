/**
 * The sizes of the workflow's picture and video inputs, as their wells load them (file name →
 * size), so the megapixel setting can say what size a run will make. Kept in memory only.
 */
import { create } from "zustand";

export type MediaSize = { w: number; h: number; seconds: number | null };

export const useMediaSizes = create<{
  sizes: Record<string, MediaSize>;
  set: (file: string, size: MediaSize) => void;
}>((set) => ({
  sizes: {},
  set: (file, size) => set((s) => ({ sizes: { ...s.sizes, [file]: size } })),
}));
