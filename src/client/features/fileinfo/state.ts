/**
 * What File Info shows: a file Blombo already knows (a gallery image or a local model), picked
 * from another view, or a dropped file (kept in the view itself).
 */
import { create } from "zustand";

export type FileInfoTarget =
  | { type: "gallery"; id: number; name: string }
  | { type: "model"; id: string; name: string };

export const useFileInfoTarget = create<{
  target: FileInfoTarget | null;
  set: (target: FileInfoTarget | null) => void;
}>((set) => ({ target: null, set: (target) => set({ target }) }));
