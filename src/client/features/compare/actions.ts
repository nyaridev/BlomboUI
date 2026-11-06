/**
 * What Compare's buttons do: make a comparison from Generate's current settings, start, stop,
 * clone and remove one. Each answer goes into the list at once (the live bus says it too); a
 * failure shows the server's message.
 */
import { api } from "@client/lib/api";
import { putCompare, qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { CompareTask, CompareUpdateInput, NewCompareInput } from "@shared/compare";
import type { WorkflowSummary } from "@shared/workflow/manifest";
import { useValues } from "../generate/state";
import { pickWorkflow, useActiveChoice } from "../generate/workflow";
import { useCompareUi } from "./state";

function fail(error: unknown): null {
  toast(error instanceof Error ? error.message : String(error), "error");
  return null;
}

/**
 * Generate's workflow, values and stages, as a comparison's starting point. Before Generate has
 * been opened in this window, its workflow's saved settings (the server fills them in).
 */
export function generateBase(): Pick<NewCompareInput, "workflowId" | "values" | "stages"> | null {
  const { workflowId, values, stages } = useValues.getState();
  if (workflowId)
    return { workflowId, values, stages: stages as unknown as NewCompareInput["stages"] };
  const profileId = useSession.getState().profileId;
  const list = queryClient.getQueryData<WorkflowSummary[]>(qk.workflows(profileId));
  const wanted = profileId ? useActiveChoice.getState().byProfile[profileId] : undefined;
  const id = list ? pickWorkflow(list, wanted) : (wanted ?? null);
  if (!id) {
    toast("Pick a workflow on Generate first; a comparison starts from its settings.", "warning");
    return null;
  }
  return { workflowId: id, values: {} };
}

/** A new comparison from Generate's settings, opened on its setup page. */
export async function newComparison(): Promise<CompareTask | null> {
  const base = generateBase();
  if (!base) return null;
  try {
    const task = await api.newCompare(base);
    putCompare(task);
    useCompareUi.getState().select(task.id, "setup");
    return task;
  } catch (error) {
    return fail(error);
  }
}

export async function updateComparison(
  id: string,
  patch: CompareUpdateInput,
): Promise<CompareTask | null> {
  try {
    const task = await api.updateCompare(id, patch);
    putCompare(task);
    return task;
  } catch (error) {
    return fail(error);
  }
}

export async function startComparison(id: string, mode: "missing" | "all"): Promise<void> {
  try {
    putCompare(await api.startCompare(id, mode));
    useCompareUi.getState().setPage(id, "results");
  } catch (error) {
    fail(error);
  }
}

export async function stopComparison(id: string): Promise<void> {
  await api.stopCompare(id).catch(fail);
}

/** A copy to tweak: same settings and rows, no images, not started. */
export async function cloneComparison(id: string): Promise<void> {
  try {
    const task = await api.cloneCompare(id);
    putCompare(task);
    useCompareUi.getState().select(task.id, "setup");
    toast("Copied. Change what you like, then start it.", "success");
  } catch (error) {
    fail(error);
  }
}

export async function removeComparison(id: string): Promise<void> {
  try {
    await api.removeCompare(id);
    const profileId = useSession.getState().profileId;
    queryClient.setQueryData<CompareTask[]>(qk.compare(profileId), (old) =>
      old?.filter((t) => t.id !== id),
    );
    if (useCompareUi.getState().selected === id) useCompareUi.getState().select(null);
    toast("Removed. Its images stay in the gallery.", "success");
  } catch (error) {
    fail(error);
  }
}
