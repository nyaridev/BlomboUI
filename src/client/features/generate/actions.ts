/**
 * Generate, Interrupt and Cancel. The request carries the current values, so a click never
 * waits for the background save; the server saves them and answers with what changed for the
 * next click (the seed, when it increments).
 */
import { api } from "@client/lib/api";
import { toast } from "@client/ui";
import { create } from "zustand";
import { takePendingSave, useValues } from "./state";

/** "Generate forever" chosen for the next click (the server owns it once running). */
export const useLoopIntent = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({
  on: false,
  set: (on) => set({ on }),
}));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function generate(): Promise<void> {
  const { workflowId, values, run, merge } = useValues.getState();
  if (!workflowId) {
    toast("Pick or add a workflow first.", "warning");
    return;
  }
  takePendingSave();
  try {
    const res = await api.generate({
      workflowId,
      values,
      count: run.count,
      seedMode: run.seedMode,
      loop: useLoopIntent.getState().on,
    });
    if (Object.keys(res.values).length) merge(res.values);
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
