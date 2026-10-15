/**
 * Generate UI state, split in small stores so a slider only re-renders itself:
 *  - useValues:  the active workflow's values (binding id → value) and run settings. Edits save
 *                into the workflow in the background (debounced PATCH); there are no templates.
 *  - useStages:  Hires / ADetailer / ControlNet settings (stages arrive in a later phase)
 *  - useLayout:  the layout document, Customize mode, selection, undo/redo, presets
 */
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { Block, LayoutDocument } from "@shared/layout/schema";
import type { RunSettings, WorkflowManifest } from "@shared/workflow/manifest";
import { create } from "zustand";
import { COMPACT_LAYOUT, DEFAULT_LAYOUT } from "./layout/defaultLayout";

/* ── values ──────────────────────────────────────────────────────────────── */

interface ValuesState {
  workflowId: string | null;
  values: Record<string, unknown>;
  run: RunSettings;
  /** Show a workflow's saved values (only when switching workflows, so edits aren't lost). */
  load: (manifest: WorkflowManifest) => void;
  setValue: (id: string, value: unknown) => void;
  setRun: (patch: Partial<RunSettings>) => void;
  /** Values the server changed (the next seed after a run); not saved again. */
  merge: (values: Record<string, unknown>) => void;
}

const SAVE_DELAY_MS = 400;
let pending: {
  workflowId: string;
  values: Record<string, unknown>;
  run: Partial<RunSettings>;
} | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const batch = pending;
  pending = null;
  if (!batch) return;
  try {
    const saved = await api.patchValues(batch.workflowId, { values: batch.values, run: batch.run });
    // Keep the cached manifest current without replacing its live model choices.
    const key = qk.workflow(useSession.getState().profileId, batch.workflowId);
    queryClient.setQueryData<WorkflowManifest>(key, (old) =>
      old ? { ...old, values: saved.values, run: saved.run, updatedAt: saved.updatedAt } : old,
    );
  } catch (error) {
    toast(`Couldn't save the change: ${error instanceof Error ? error.message : error}`, "error");
  }
}

function queueSave(workflowId: string, values: Record<string, unknown>, run: Partial<RunSettings>) {
  if (pending && pending.workflowId !== workflowId) void save();
  pending = pending
    ? { workflowId, values: { ...pending.values, ...values }, run: { ...pending.run, ...run } }
    : { workflowId, values, run };
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
  load: (m) => {
    if (get().workflowId === m.id) return;
    if (pending) void save();
    set({ workflowId: m.id, values: { ...m.values }, run: { ...m.run } });
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
  merge: (values) => set((s) => ({ values: { ...s.values, ...values } })),
}));

export function useValue<T>(id: string): [T, (v: T) => void] {
  const value = useValues((s) => s.values[id]) as T;
  const setValue = useValues((s) => s.setValue);
  return [value, (v: T) => setValue(id, v)];
}

/* ── stages ──────────────────────────────────────────────────────────────── */

export interface AdUnit {
  id: string;
  name: string;
  detector: string;
  confidence: number;
  denoise: number;
  maskBlur: number;
  promptOverride: boolean;
  prompt: string;
}

export interface CnUnit {
  id: string;
  name: string;
  preprocessor: string;
  model: string;
  strength: number;
  start: number;
  end: number;
  mode: "balanced" | "prompt" | "control";
}

interface StagesState {
  hires: {
    enabled: boolean;
    sizeMode: "scale" | "target";
    scale: number;
    upscaler: string;
    denoise: number;
    steps: number;
    stepsOverride: boolean;
    samplerOverride: boolean;
    sampler: string;
    cfgOverride: boolean;
    cfg: number;
    saveFirst: boolean;
  };
  adetailer: { enabled: boolean; active: string; units: AdUnit[] };
  controlnet: { enabled: boolean; active: string; units: CnUnit[] };
  patch: <K extends "hires" | "adetailer" | "controlnet">(
    key: K,
    value: Partial<StagesState[K]>,
  ) => void;
}

export const useStages = create<StagesState>((set) => ({
  hires: {
    enabled: true,
    sizeMode: "scale",
    scale: 1.5,
    upscaler: "4x-UltraSharp",
    denoise: 0.38,
    steps: 14,
    stepsOverride: true,
    samplerOverride: false,
    sampler: "euler_ancestral",
    cfgOverride: false,
    cfg: 5.5,
    saveFirst: false,
  },
  adetailer: {
    enabled: false,
    active: "face",
    units: [
      {
        id: "face",
        name: "Face",
        detector: "face_yolov8m",
        confidence: 0.35,
        denoise: 0.4,
        maskBlur: 4,
        promptOverride: false,
        prompt: "",
      },
      {
        id: "hands",
        name: "Hands",
        detector: "hand_yolov8s",
        confidence: 0.3,
        denoise: 0.35,
        maskBlur: 4,
        promptOverride: true,
        prompt: "detailed hands, five fingers",
      },
    ],
  },
  controlnet: {
    enabled: false,
    active: "pose",
    units: [
      {
        id: "pose",
        name: "Pose",
        preprocessor: "dwpose",
        model: "controlnet-openpose-sdxl",
        strength: 0.85,
        start: 0,
        end: 0.8,
        mode: "balanced",
      },
    ],
  },
  patch: (key, value) => set((s) => ({ [key]: { ...s[key], ...value } }) as Partial<StagesState>),
}));

/* ── layout + customize ──────────────────────────────────────────────────── */

const PRESETS_KEY = "blombo.layoutPresets";

function loadPresets(): LayoutDocument[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as LayoutDocument[]) : [];
  } catch {
    return [];
  }
}

interface LayoutState {
  doc: LayoutDocument;
  builtins: LayoutDocument[];
  custom: LayoutDocument[];
  customizing: boolean;
  selected: string | null;
  past: LayoutDocument[];
  future: LayoutDocument[];
  setCustomizing: (on: boolean) => void;
  select: (id: string | null) => void;
  apply: (next: LayoutDocument) => void;
  undo: () => void;
  redo: () => void;
  load: (id: string) => void;
  saveAs: (name: string) => void;
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
  doc: DEFAULT_LAYOUT,
  builtins: [DEFAULT_LAYOUT, COMPACT_LAYOUT],
  custom: loadPresets(),
  customizing: false,
  selected: null,
  past: [],
  future: [],
  setCustomizing: (customizing) => set({ customizing, selected: null }),
  select: (selected) => set({ selected }),
  apply: (next) => set((s) => ({ doc: next, past: [...s.past.slice(-49), s.doc], future: [] })),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      return prev ? { doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future] } : s;
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      return next ? { doc: next, past: [...s.past, s.doc], future: s.future.slice(1) } : s;
    }),
  load: (id) => {
    const found = [...get().builtins, ...get().custom].find((l) => l.id === id);
    if (found) get().apply(structuredClone(found));
  },
  saveAs: (name) => {
    const doc = { ...structuredClone(get().doc), id: `custom-${Date.now().toString(36)}`, name };
    const custom = [...get().custom, doc];
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(custom));
    } catch {
      // Storage can be unavailable; the preset still lives for this session.
    }
    set({ custom, doc });
  },
  updateBlock: (id, patch) => {
    const s = get();
    s.apply({
      ...s.doc,
      regions: { ...s.doc.regions, params: mapBlocks(s.doc.regions.params, id, patch) },
    });
  },
  moveParams: (from, to) => {
    const s = get();
    s.apply({
      ...s.doc,
      regions: { ...s.doc.regions, params: arrayMove(s.doc.regions.params, from, to) },
    });
  },
  moveInCard: (cardId, from, to) => {
    const s = get();
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
