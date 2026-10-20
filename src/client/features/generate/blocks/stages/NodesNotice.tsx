/**
 * A "needs custom nodes" notice (a stage's, or a batch workflow's). For a ComfyUI Blombo manages it offers Install (the
 * server downloads the packs at their pinned commits, installs their packages and restarts
 * ComfyUI) and shows that install's progress in place; for your own ComfyUI it links the packs
 * and ComfyUI, because Blombo doesn't change a ComfyUI it doesn't run. The progress comes over
 * the live bus, so a reload or another window shows the same install.
 */
import { api } from "@client/lib/api";
import { followTopic, useLive } from "@client/lib/live";
import { openWindow } from "@client/lib/platform";
import { queryClient, useNodeInstall } from "@client/lib/queries";
import { Button, Notice, ProgressBar, toast } from "@client/ui";
import type { NodeInstallState } from "@shared/install";
import type { StageProblem } from "@shared/workflow/stages";
import { useEffect, useState } from "react";

export function NodesNotice({ problem }: { problem: StageProblem }) {
  useEffect(() => followTopic("install"), []);
  const initial = useNodeInstall();
  const live = useLive((s) => s.nodeInstall);
  const comfyUrl = useLive((s) => s.comfy?.url ?? null);
  const managed = useLive((s) => s.comfy?.mode === "managed");
  const slot = useLive((s) => s.comfy?.slot ?? null);
  const [starting, setStarting] = useState(false);
  const install = live ?? initial.data ?? null;

  const packs = problem.packs ?? [];
  const installable = managed && packs.length > 0 && packs.every((p) => p.ref);
  // The installer's latest run, if it was for (some of) these packs in this profile's slot.
  const ours =
    managed &&
    install &&
    install.state !== "idle" &&
    install.slot === slot &&
    packs.some((p) => install.packs.includes(p.url))
      ? install
      : null;
  const running = install?.state === "running";

  const start = async () => {
    setStarting(true);
    try {
      await api.installNodes(packs.map((p) => p.url));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setStarting(false);
    }
  };

  const recheck = async () => {
    await api.comfyRefresh().catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ["stage-report"] });
    void queryClient.invalidateQueries({ queryKey: ["batch-check"] });
  };

  if (ours?.state === "running") return <Progress install={ours} />;

  const links = packs.map((p) => (
    <Button
      key={p.url}
      size="sm"
      variant="ghost"
      icon="globe"
      onClick={() => window.open(p.url, "_blank", "noopener")}
    >
      {p.name}
    </Button>
  ));
  const failed = ours && (ours.state === "error" || ours.state === "cancelled") ? ours : null;
  const doneNote = ours?.state === "done" ? ours.note : null;

  return (
    <Notice
      tone={failed?.state === "error" ? "danger" : "warning"}
      title={failed ? (failed.state === "error" ? "Install failed" : "Install stopped") : undefined}
      actions={
        <>
          {installable ? (
            <Button
              size="sm"
              variant="primary"
              icon="download"
              disabled={running || starting}
              onClick={() => void start()}
            >
              {failed ? "Install again" : "Install"}
            </Button>
          ) : comfyUrl ? (
            <Button size="sm" icon="external" onClick={() => void openWindow(comfyUrl, "ComfyUI")}>
              Open ComfyUI
            </Button>
          ) : null}
          {links}
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => void recheck()}>
            Check again
          </Button>
        </>
      }
    >
      {failed?.error ? <span className="block">{failed.error}</span> : null}
      {doneNote ? <span className="block">Installed. {doneNote}</span> : null}
      {failed || doneNote ? null : problem.message}
      {installable && running && !ours ? (
        <span className="block">Other custom nodes are being installed. Wait for them first.</span>
      ) : null}
    </Notice>
  );
}

/** The running install: which step, how far, and Stop. */
function Progress({ install }: { install: NodeInstallState }) {
  const index = install.steps.findIndex((s) => s.state === "active");
  const active = install.steps[index];
  const label = active?.label ?? "Getting ready";
  return (
    <Notice
      tone="info"
      title={`Installing custom nodes · ${Math.max(index, 0) + 1} of ${install.steps.length}`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon="stop"
          onClick={() => void api.cancelNodeInstall().catch(() => undefined)}
        >
          Stop
        </Button>
      }
    >
      <span className="flex flex-col gap-1.5">
        <span>{label}</span>
        <ProgressBar value={active?.progress ?? null} label={label} size="sm" />
        {active?.detail ? (
          <span className="truncate font-mono text-[11px] text-fg-3">{active.detail}</span>
        ) : null}
      </span>
    </Notice>
  );
}
