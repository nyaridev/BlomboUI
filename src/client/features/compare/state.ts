/**
 * Compare's UI state, per window: which comparison is open, its page (setup or results), and how
 * each one's results are laid out (what's across and down, the value shown for every other row,
 * the tile size). Comparisons themselves are server data (`useCompareTasks`).
 */
import { useLocalModels, useWorkflow } from "@client/lib/queries";
import { type ComparePlan, type CompareTask, compareTitle, planCompare } from "@shared/compare";
import { loraWeights, ScriptError } from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { useMemo } from "react";
import { create } from "zustand";

export type ComparePage = "setup" | "results";

export interface GridLayout {
  /** Row indexes shown across and down (-1: none). */
  x: number;
  y: number;
  /** Row index → the value shown for a row that's neither across nor down. */
  pins: Record<number, number>;
  /** Tile width in px. */
  size: number;
}

export const TILE_SIZES = { min: 72, max: 640, default: 192 };

export const NEW_LAYOUT: GridLayout = { x: 0, y: 1, pins: {}, size: TILE_SIZES.default };

interface CompareUi {
  selected: string | null;
  page: Record<string, ComparePage>;
  layouts: Record<string, GridLayout>;
  select: (id: string | null, page?: ComparePage) => void;
  setPage: (id: string, page: ComparePage) => void;
  setLayout: (id: string, patch: Partial<GridLayout>) => void;
}

export const useCompareUi = create<CompareUi>((set, get) => ({
  selected: null,
  page: {},
  layouts: {},
  select: (id, page) =>
    set({
      selected: id,
      ...(id && page ? { page: { ...get().page, [id]: page } } : {}),
    }),
  setPage: (id, page) => set({ page: { ...get().page, [id]: page } }),
  setLayout: (id, patch) =>
    set({
      layouts: { ...get().layouts, [id]: { ...(get().layouts[id] ?? NEW_LAYOUT), ...patch } },
    }),
}));

export interface TaskPlan {
  bindings: Binding[];
  plan: ComparePlan | null;
  error: string | null;
  title: string;
  /** The workflow is still loading. */
  loading: boolean;
}

/** A comparison planned against its workflow, the way the server will run it. */
export function useTaskPlan(task: CompareTask | undefined, axes = task?.axes): TaskPlan {
  const workflow = useWorkflow(task?.workflowId ?? null);
  const local = useLocalModels().data;
  const bindings = workflow.data?.bindings;
  return useMemo(() => {
    const b = bindings ?? [];
    const title = task ? compareTitle({ name: task.name, axes: axes ?? [] }, b) : "";
    if (!task || !bindings)
      return {
        bindings: b,
        plan: null,
        error: workflow.isError
          ? "The workflow this comparison uses is gone. Take Generate's settings to use another."
          : null,
        title,
        loading: !workflow.isError,
      };
    try {
      const values = { ...workflow.data?.values, ...task.values };
      const plan = planCompare(axes ?? [], bindings, values, loraWeights(local));
      return { bindings, plan, error: null, title, loading: false };
    } catch (error) {
      const message =
        error instanceof ScriptError
          ? error.message
          : ((error as { issues?: Array<{ message: string }> }).issues?.[0]?.message ??
            String(error));
      return { bindings, plan: null, error: message, title, loading: false };
    }
  }, [task, axes, bindings, local, workflow.data?.values, workflow.isError]);
}
