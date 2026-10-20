/**
 * Generate, Interrupt and Cancel. The request carries the current values, so a click never
 * waits for the background save; the server saves them and answers with what changed for the
 * next click (the seed, when it increments).
 */
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { WorkflowDetail } from "@shared/workflow/manifest";
import type { StageReport } from "@shared/workflow/stages";
import { create } from "zustand";
import { buildScript, useScript } from "./scripts";
import { takePendingSave, useValues } from "./state";

/** "Generate forever" chosen for the next click (the server owns it once running). */
export const useLoopIntent = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set: (on) => set({ on }),
}));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * An enabled stage that's missing something would only fail once ComfyUI gets it; say so now,
 * with a way out. Uses the last check the stage blocks made (it follows the settings).
 */
function blockedByStage(workflowId: string): boolean {
  const { stages, setStage } = useValues.getState();
  const profileId = useSession.getState().profileId;
  // The check for these exact settings, or else the newest one (settings changed a moment ago).
  const found = queryClient
    .getQueryCache()
    .findAll({ queryKey: qk.stageReport(profileId, workflowId, undefined).slice(0, 3) })
    .filter((q) => q.state.data)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const current = JSON.stringify(stages);
  const match = found.find((q) => JSON.stringify(q.queryKey[3]) === current) ?? found[0];
  const report = match?.state.data as StageReport | undefined;
  if (!report?.checked) return false;
  for (const s of report.stages) {
    const key = s.stage as "hires" | "adetailer" | "controlnet";
    if (!stages[key]?.enabled) continue;
    // Problems of units that are off don't matter.
    const units: Array<{ id: string; enabled: boolean }> = key === "hires" ? [] : stages[key].units;
    const problem = s.problems.find(
      (p) => !p.unit || units.some((u) => u.id === p.unit && u.enabled),
    );
    if (!problem) continue;
    toast(problem.message, "warning", {
      label: "Turn it off",
      run: () => setStage(key, { ...stages[key], enabled: false } as never),
    });
    return true;
  }
  return false;
}

export async function generate(): Promise<void> {
  const { workflowId, values, run, stages, merge } = useValues.getState();
  if (!workflowId) {
    toast("Pick or add a workflow first.", "warning");
    return;
  }
  if (blockedByStage(workflowId)) return;
  // A script on: Generate runs it (one click, many images).
  const draft = useScript.getState().draft;
  let script: ReturnType<typeof buildScript> | null = null;
  if (draft.kind !== "off") {
    const profileId = useSession.getState().profileId;
    const detail = queryClient.getQueryData<WorkflowDetail>(qk.workflow(profileId, workflowId));
    script = buildScript(draft, detail?.bindings ?? [], values);
    if (!script.script) {
      toast(script.error ?? "The script isn't ready yet.", "warning");
      return;
    }
  }
  takePendingSave();
  try {
    const res = await api.generate({
      workflowId,
      values,
      stages,
      count: run.count,
      seedMode: run.seedMode,
      loop: script ? false : useLoopIntent.getState().on,
      ...(script?.script ? { script: script.script } : {}),
    });
    if (Object.keys(res.values).length) merge(res.values);
    // The queued save was dropped (the request carried the values): keep the cached workflow
    // in step, or switching away and back would show the values from before.
    const profileId = useSession.getState().profileId;
    queryClient.setQueryData<WorkflowDetail>(qk.workflow(profileId, workflowId), (old) =>
      old
        ? {
            ...old,
            values: { ...old.values, ...values, ...res.values },
            run: { ...old.run, ...run },
            stages: stages as unknown as WorkflowDetail["stages"],
          }
        : old,
    );
    if (script?.plan)
      toast(
        `Queued ${script.plan.title}: ${res.jobs.length} image${res.jobs.length === 1 ? "" : "s"}`,
        "info",
      );
  } catch (e) {
    toast(message(e), "error");
  }
}

export async function interrupt(): Promise<void> {
  try {
    await api.interrupt();
    toast("Stopped this image. The queue continues.", "info");
  } catch (e) {
    toast(message(e), "error");
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await api.cancelAll();
    useLoopIntent.getState().set(false);
    toast("Cancelled the run and cleared the queue", "warning");
  } catch (e) {
    toast(message(e), "error");
  }
}

export async function setLoop(on: boolean, running: boolean): Promise<void> {
  useLoopIntent.getState().set(on);
  if (!on && running) await api.setLoop(false).catch((e) => toast(message(e), "error"));
}
