/**
 * Generate UI state, split in small stores so a slider only re-renders itself:
 *  - useValues:  the active workflow's values (binding id → value), run settings and stage
 *                settings. Edits save into the workflow in the background (debounced PATCH);
 *                there are no templates.
 *  - useLayout:  the layout document the params column shows, Customize mode, selection and
 *                undo/redo. Layouts are saved in the profile (features/generate/layouts.ts).
 */
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { Block, LayoutDocument } from "@shared/layout/schema";
import type {
  RunSettings,
  StagesRecord,
  WorkflowDetail,
  WorkflowManifest,
} from "@shared/workflow/manifest";
import { readStages, type StageSettings } from "@shared/workflow/stages";
import type { z } from "zod";
import { create } from "zustand";

/* ── values ──────────────────────────────────────────────────────────────── */

type StagesPatch = z.infer<typeof StagesRecord>;

interface ValuesState {
  workflowId: string | null;
  values: Record<string, unknown>;
  run: RunSettings;
  stages: StageSettings;
  /** Show a workflow's saved values (only when switching workflows, so edits aren't lost). */
  load: (manifest: WorkflowManifest) => void;
  /**
   * Take the saved values of the open workflow again (it was saved from ComfyUI). The server's
   * copy is newer, so unsaved edits of this workflow are dropped.
   */
  reload: (manifest: WorkflowManifest) => void;
  setValue: (id: string, value: unknown) => void;
  setRun: (patch: Partial<RunSettings>) => void;
  /** Replace one stage's settings (saved like values). */
  setStage: <K extends keyof StageSettings>(key: K, value: StageSettings[K]) => void;
  /** Values the server changed (the next seed after a run); not saved again. */
  merge: (values: Record<string, unknown>) => void;
}

const SAVE_DELAY_MS = 400;
let pending: {
  workflowId: string;
  values: Record<string, unknown>;
  run: Partial<RunSettings>;
  stages: StagesPatch;
} | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const batch = pending;
  pending = null;
  if (!batch) return;
  try {
    const saved = await api.patchValues(batch.workflowId, {
      values: batch.values,
      run: batch.run,
      ...(Object.keys(batch.stages).length ? { stages: batch.stages } : {}),
    });
    // Keep the cached workflow current without replacing its live choices and layout.
    const key = qk.workflow(useSession.getState().profileId, batch.workflowId);
    queryClient.setQueryData<WorkflowDetail>(key, (old) =>
      old
        ? {
            ...old,
            values: saved.values,
            run: saved.run,
            stages: saved.stages,
            updatedAt: saved.updatedAt,
          }
        : old,
    );
  } catch (error) {
    toast(`Couldn't save the change: ${error instanceof Error ? error.message : error}`, "error");
  }
}

function queueSave(
  workflowId: string,
  values: Record<string, unknown>,
  run: Partial<RunSettings>,
  stages: StagesPatch = {},
) {
  if (pending && pending.workflowId !== workflowId) void save();
  pending = pending
    ? {
        workflowId,
        values: { ...pending.values, ...values },
        run: { ...pending.run, ...run },
        stages: { ...pending.stages, ...stages },
      }
    : { workflowId, values, run, stages };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
}

/** Drop the queued save: the Generate request carries the same values. */
export function takePendingSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  pending = null;
}

export const useValues = create<ValuesState>((set, get) => ({
  workflowId: null,
  values: {},
  run: { seedMode: "random", count: 1 },
  stages: readStages({}),
  load: (m) => {
    if (get().workflowId === m.id) return;
    if (pending) void save();
    set({
      workflowId: m.id,
      values: { ...m.values },
      run: { ...m.run },
      stages: readStages(m.stages),
    });
  },
  reload: (m) => {
    if (get().workflowId !== m.id) return;
    if (pending?.workflowId === m.id) {
      pending = null;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ values: { ...m.values }, run: { ...m.run }, stages: readStages(m.stages) });
  },
  setValue: (id, value) => {
    const wf = get().workflowId;
    set((s) => ({ values: { ...s.values, [id]: value } }));
    if (wf) queueSave(wf, { [id]: value }, {});
  },
  setRun: (patch) => {
    const wf = get().workflowId;
    set((s) => ({ run: { ...s.run, ...patch } }));
    if (wf) queueSave(wf, {}, patch);
  },
  setStage: (key, value) => {
    const wf = get().workflowId;
    set((s) => ({ stages: { ...s.stages, [key]: value } }));
    if (wf) queueSave(wf, {}, {}, { [key]: value as unknown as Record<string, unknown> });
  },
  merge: (values) => set((s) => ({ values: { ...s.values, ...values } })),
}));

export function useValue<T>(id: string): [T, (v: T) => void] {
  const value = useValues((s) => s.values[id]) as T;
  const setValue = useValues((s) => s.setValue);
  return [value, (v: T) => setValue(id, v)];
}

/** One stage's settings and a setter that merges a patch into them. */
export function useStage<K extends keyof StageSettings>(
  key: K,
): [StageSettings[K], (patch: Partial<StageSettings[K]>) => void] {
  const value = useValues((s) => s.stages[key]);
  const setStage = useValues((s) => s.setStage);
  return [value, (patch) => setStage(key, { ...useValues.getState().stages[key], ...patch })];
}

/* ── layout + customize ──────────────────────────────────────────────────── */

interface LayoutState {
  /** What the params column shows (null until a workflow loads). */
  doc: LayoutDocument | null;
  /** The layout as saved; `doc !== saved` means there are unsaved edits. */
  saved: LayoutDocument | null;
  /** The workflow links this layout, or shows the profile's default. */
  source: "linked" | "default";
  workflowId: string | null;
  customizing: boolean;
  selected: string | null;
  past: LayoutDocument[];
  future: LayoutDocument[];
  /** Show a workflow's layout (on load and when switching; unsaved edits stay). */
  show: (detail: WorkflowDetail) => void;
  /** Replace the document with a saved one (picked, saved or reset). */
  setSaved: (doc: LayoutDocument, source: "linked" | "default") => void;
  setCustomizing: (on: boolean) => void;
  select: (id: string | null) => void;
  apply: (next: LayoutDocument) => void;
  undo: () => void;
  redo: () => void;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  moveParams: (from: number, to: number) => void;
  moveInCard: (cardId: string, from: number, to: number) => void;
}

function mapBlocks(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, ...patch } as Block;
    if (b.type === "card")
      return { ...b, children: mapBlocks(b.children, id, patch) as typeof b.children };
    return b;
  });
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export const useLayout = create<LayoutState>((set, get) => ({
  doc: null,
  saved: null,
  source: "default",
  workflowId: null,
  customizing: false,
  selected: null,
  past: [],
  future: [],
  show: (detail) => {
    const s = get();
    const switched = s.workflowId !== detail.id;
    // Same workflow: unsaved edits stay on screen until they're saved or thrown away.
    if (!switched && (s.doc !== s.saved || s.saved === detail.layoutDoc)) return;
    set({
      doc: detail.layoutDoc,
      saved: detail.layoutDoc,
      source: detail.layoutSource,
      workflowId: detail.id,
      past: switched ? [] : s.past,
      future: switched ? [] : s.future,
      selected: null,
    });
  },
  setSaved: (doc, source) =>
    set((s) => ({
      doc,
      saved: doc,
      source,
      past: s.doc ? [...s.past.slice(-49), s.doc] : s.past,
      future: [],
      selected: null,
    })),
  setCustomizing: (customizing) => set({ customizing, selected: null }),
  select: (selected) => set({ selected }),
  apply: (next) =>
    set((s) => ({ doc: next, past: s.doc ? [...s.past.slice(-49), s.doc] : s.past, future: [] })),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      return prev && s.doc
        ? { doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future] }
        : s;
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      return next && s.doc ? { doc: next, past: [...s.past, s.doc], future: s.future.slice(1) } : s;
    }),
  updateBlock: (id, patch) => {
    const s = get();
    if (!s.doc) return;
    s.apply({
      ...s.doc,
      regions: { ...s.doc.regions, params: mapBlocks(s.doc.regions.params, id, patch) },
    });
  },
  moveParams: (from, to) => {
    const s = get();
    if (!s.doc) return;
    s.apply({
      ...s.doc,
      regions: { ...s.doc.regions, params: arrayMove(s.doc.regions.params, from, to) },
    });
  },
  moveInCard: (cardId, from, to) => {
    const s = get();
    if (!s.doc) return;
    const params = s.doc.regions.params.map((b) =>
      b.type === "card" && b.id === cardId
        ? { ...b, children: arrayMove(b.children, from, to) }
        : b,
    );
    s.apply({ ...s.doc, regions: { ...s.doc.regions, params } });
  },
}));

export function findBlock(blocks: Block[], id: string | null): Block | undefined {
  if (!id) return undefined;
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "card") {
      const inner = b.children.find((c) => c.id === id);
      if (inner) return inner;
    }
  }
  return undefined;
}
