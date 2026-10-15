/**
 * The workflow the Generate screen shows. The choice is remembered per profile in this
 * window (localStorage); if it no longer exists, the first generate workflow takes its place.
 */
import { useWorkflow, useWorkflows } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import type { Binding, WorkflowManifest, WorkflowSummary } from "@shared/workflow/manifest";
import { create } from "zustand";

const KEY = "blombo.activeWorkflow";

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export const useActiveChoice = create<{
  byProfile: Record<string, string>;
  choose: (profileId: string, workflowId: string) => void;
}>((set, get) => ({
  byProfile: load(),
  choose: (profileId, workflowId) => {
    const byProfile = { ...get().byProfile, [profileId]: workflowId };
    try {
      localStorage.setItem(KEY, JSON.stringify(byProfile));
    } catch {
      // Storage can be unavailable; the choice still holds for this session.
    }
    set({ byProfile });
  },
}));

function pick(list: WorkflowSummary[], wanted: string | undefined): string | null {
  if (wanted && list.some((w) => w.id === wanted)) return wanted;
  return list.find((w) => w.kind === "generate")?.id ?? list[0]?.id ?? null;
}

/** The active workflow id (null while loading or when the profile has none). */
export function useActiveWorkflowId(): string | null {
  const profileId = useSession((s) => s.profileId);
  const wanted = useActiveChoice((s) => (profileId ? s.byProfile[profileId] : undefined));
  const { data } = useWorkflows();
  return data ? pick(data, wanted) : null;
}

export function useActiveWorkflow(): {
  id: string | null;
  manifest: WorkflowManifest | undefined;
  loading: boolean;
  error: Error | null;
  empty: boolean;
} {
  const list = useWorkflows();
  const id = useActiveWorkflowId();
  const wf = useWorkflow(id);
  return {
    id,
    manifest: wf.data,
    loading: list.isLoading || (id !== null && wf.isLoading),
    error: (list.error ?? wf.error) as Error | null,
    empty: Boolean(list.data && list.data.length === 0),
  };
}

const NONE: Binding[] = [];

/** Bindings of the active workflow (stable while it doesn't change). */
export function useBindings(): Binding[] {
  const id = useActiveWorkflowId();
  return useWorkflow(id).data?.bindings ?? NONE;
}

/** The binding with a role in the active workflow. */
export function useRoleBinding(role: string): Binding | undefined {
  return useBindings().find((b) => b.role === role);
}
