/**
 * Wildcard Manager UI state: the open file, open folders, the editing mode and unsaved drafts.
 * Drafts are kept per file, so switching files never loses typing; a dot in the tree shows them.
 */
import { create } from "zustand";

export interface Draft {
  text: string;
  /** mtime of the file the draft started from (save refuses if the file changed since). */
  baseMtime: number;
}

interface WildcardUi {
  open: string | null;
  expanded: Set<string>;
  mode: "raw" | "lines";
  drafts: Record<string, Draft>;
  setOpen: (path: string | null) => void;
  toggle: (folder: string, open?: boolean) => void;
  setMode: (mode: "raw" | "lines") => void;
  setDraft: (path: string, draft: Draft) => void;
  dropDraft: (path: string) => void;
  /** A file or folder moved: carry the open file and drafts along. */
  moved: (from: string, to: string) => void;
}

const under = (p: string, folder: string) => p === folder || p.startsWith(`${folder}/`);
const rebase = (p: string, from: string, to: string) =>
  under(p, from) ? to + p.slice(from.length) : p;

export const useWildcardUi = create<WildcardUi>((set) => ({
  open: null,
  expanded: new Set(),
  mode: "raw",
  drafts: {},
  setOpen: (open) =>
    set((s) => {
      if (!open) return { open };
      // Opening a file reveals its folders.
      const expanded = new Set(s.expanded);
      const parts = open.split("/");
      for (let i = 1; i < parts.length; i++) expanded.add(parts.slice(0, i).join("/"));
      return { open, expanded };
    }),
  toggle: (folder, open) =>
    set((s) => {
      const expanded = new Set(s.expanded);
      const next = open ?? !expanded.has(folder);
      if (next) expanded.add(folder);
      else expanded.delete(folder);
      return { expanded };
    }),
  setMode: (mode) => set({ mode }),
  setDraft: (path, draft) => set((s) => ({ drafts: { ...s.drafts, [path]: draft } })),
  dropDraft: (path) =>
    set((s) => {
      const drafts = { ...s.drafts };
      delete drafts[path];
      return { drafts };
    }),
  moved: (from, to) =>
    set((s) => ({
      open: s.open ? rebase(s.open, from, to) : s.open,
      drafts: Object.fromEntries(
        Object.entries(s.drafts).map(([p, d]) => [rebase(p, from, to), d]),
      ),
      expanded: new Set([...s.expanded].map((p) => rebase(p, from, to))),
    })),
}));
