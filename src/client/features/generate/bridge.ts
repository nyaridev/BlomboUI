/**
 * Round trips with ComfyUI (ADR-0009) from Blombo's side: "Edit in ComfyUI" asks the server for
 * an edit session and opens ComfyUI in a new window with it; workflows saved back from there
 * arrive over the live bus (`workflow.saved`) and are announced here with what changed.
 * Export downloads the workflow as a .blombo file.
 */
import { router } from "@client/app/router";
import { useSettingsNav } from "@client/features/settings/nav";
import { ApiError, api, workflowExportUrl } from "@client/lib/api";
import { useLive } from "@client/lib/live";
import { prepareWindow } from "@client/lib/platform";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import { describeResync } from "@shared/bridge";
import { useEffect } from "react";
import { useLayout, useValues } from "./state";
import { useActiveChoice } from "./workflow";

function openComfySettings(): void {
  const profileId = useSession.getState().profileId;
  useSettingsNav.getState().go("comfy");
  if (profileId)
    void router.navigate({ to: "/p/$profileId/$view", params: { profileId, view: "settings" } });
}

export async function editInComfy(workflowId: string): Promise<void> {
  // The window opens inside the click; it's pointed at ComfyUI once the session exists.
  const win = prepareWindow("ComfyUI");
  try {
    const session = await api.editSession(workflowId);
    await win.go(session.url);
    toast("Opened in ComfyUI. Use Save to Blombo there to bring your changes back.", "info");
  } catch (error) {
    win.close();
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ApiError && error.code === "bridge_missing")
      toast(message, "warning", { label: "ComfyUI settings", run: openComfySettings });
    else toast(message, "error");
  }
}

/** Download the workflow as a .blombo file (the server names it). */
export function exportWorkflow(workflowId: string): void {
  const a = document.createElement("a");
  a.href = workflowExportUrl(workflowId);
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}

/** Toasts for workflows saved from ComfyUI; mount once per window (Shell). */
/** The last save announced, for the whole window: the Shell remounts when you come back from
 * the profile screen, and the same save mustn't be announced (and reloaded) again. */
let announced: number | null = null;

export function useBridgeToasts(): void {
  const saved = useLive((s) => s.bridgeSaved);
  useEffect(() => {
    if (!saved || saved.at === announced) return;
    announced = saved.at;
    const profileId = useSession.getState().profileId;
    const open = () => {
      if (profileId) useActiveChoice.getState().choose(profileId, saved.workflowId);
    };
    if (saved.created) {
      toast(`"${saved.name}" came in from ComfyUI`, "success", { label: "Open", run: open });
      return;
    }
    const what = saved.report ? describeResync(saved.report) : "Saved";
    toast(`Saved "${saved.name}" from ComfyUI · ${what}`, "success");
    // The open workflow shows what was saved (values changed in ComfyUI included).
    if (profileId && useValues.getState().workflowId === saved.workflowId)
      void queryClient
        .fetchQuery({
          queryKey: qk.workflow(profileId, saved.workflowId),
          queryFn: () => api.workflow(saved.workflowId),
          staleTime: 0,
        })
        .then((detail) => {
          useValues.getState().reload(detail);
          useLayout.getState().show(detail);
        })
        .catch(() => undefined);
  }, [saved]);
}
