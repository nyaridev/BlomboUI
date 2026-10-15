/**
 * Header system status, all from the live bus: the queue (only while busy), VRAM, GPU
 * temperature, the three memory actions, ComfyUI's state with start/stop/restart and its log,
 * and an errors badge that exists only when there's something to read.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { dismissErrors, useLive } from "@client/lib/live";
import { snappy } from "@client/lib/motion";
import { openWindow } from "@client/lib/platform";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Button,
  CountBubble,
  IconButton,
  Meter,
  Popover,
  ProgressRing,
  StatusDot,
  Tooltip,
  toast,
} from "@client/ui";
import type { ComfyState } from "@shared/comfy";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useSettingsNav } from "../../features/settings/nav";
import { ComfyLogs } from "./ComfyLogs";
import { DownloadsChip } from "./DownloadsChip";

function heatColor(c: number): string {
  if (c >= 85) return "var(--red-ink)";
  if (c >= 75) return "var(--orange-ink)";
  if (c >= 65) return "var(--yellow-ink)";
  return "var(--green-ink)";
}

const STATE_LABEL: Record<ComfyState, string> = {
  running: "ComfyUI is running",
  starting: "ComfyUI is starting…",
  restarting: "ComfyUI is restarting…",
  stopping: "ComfyUI is stopping…",
  stopped: "ComfyUI is stopped",
  crashed: "ComfyUI stopped unexpectedly",
  missing: "ComfyUI is not installed",
  unreachable: "Can't reach ComfyUI",
};

function uptime(since: string | null): string {
  if (!since) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60_000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function run(action: () => Promise<unknown>, done: string) {
  try {
    await action();
    toast(done, "success");
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
  }
}

export function SystemCluster() {
  const comfy = useLive((s) => s.comfy);
  const gpu = useLive((s) => s.stats?.gpu ?? null);
  const running = comfy?.state === "running";

  return (
    <div className="flex items-center gap-1.5">
      <QueueChip />
      <DownloadsChip />

      {gpu ? (
        <Tooltip
          content={`${gpu.name} · VRAM ${gpu.vramUsed.toFixed(1)} of ${gpu.vramTotal.toFixed(1)} GB in use`}
        >
          <div>
            <Meter
              label="VRAM"
              value={gpu.vramUsed}
              max={gpu.vramTotal}
              valueText={`${gpu.vramUsed.toFixed(1)}/${Math.round(gpu.vramTotal)}G`}
              width={64}
              className="max-[1100px]:hidden"
            />
          </div>
        </Tooltip>
      ) : null}
      {gpu?.tempC !== null && gpu?.tempC !== undefined ? (
        <Tooltip content={`GPU temperature${gpu.load !== null ? ` · ${gpu.load}% load` : ""}`}>
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 font-mono text-xs tabular max-[980px]:hidden">
            <Icon name="thermometer" size={14} style={{ color: heatColor(gpu.tempC) }} />
            <span
              style={{ color: heatColor(gpu.tempC) }}
              className="transition-colors duration-700"
            >
              {gpu.tempC}°
            </span>
          </div>
        </Tooltip>
      ) : null}

      <div className="ml-1 flex items-center">
        <IconButton
          icon="unload-models"
          label="Unload models from VRAM"
          disabled={!running}
          onClick={() =>
            void run(
              () => api.comfyFree({ unloadModels: true, freeMemory: false }),
              "Models unloaded from VRAM",
            )
          }
        />
        <IconButton
          icon="free-cache"
          label="Free memory and node cache"
          disabled={!running}
          onClick={() =>
            void run(
              () => api.comfyFree({ unloadModels: true, freeMemory: true }),
              "Memory and cache freed",
            )
          }
        />
        <IconButton
          icon="rescan-models"
          label="Rescan model folders"
          disabled={!running}
          onClick={() =>
            void run(async () => {
              await api.comfyRefresh();
              await queryClient.invalidateQueries({ queryKey: qk.modelsAll });
              await queryClient.invalidateQueries({ queryKey: ["workflow"] });
            }, "Model lists refreshed")
          }
        />
      </div>

      <ComfyStatusButton />
      <ErrorsButton />
    </div>
  );
}

function QueueChip() {
  const jobs = useLive((s) => s.queue.jobs);
  const waiting = useLive((s) => s.queue.waiting);
  const overall = useLive((s) => s.progress?.progress.overall ?? 0);
  const active = jobs.find((j) => j.state === "running");
  const queued = jobs.filter((j) => j.state === "queued").length;
  const busy = Boolean(active) || queued > 0;
  const value = active ? overall : 0;
  return (
    <AnimatePresence>
      {busy ? (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          transition={snappy}
          className="overflow-hidden"
        >
          <Tooltip
            content={
              waiting
                ? "Waiting for ComfyUI to be ready"
                : `Generating${queued ? ` · ${queued} more in queue` : ""}`
            }
          >
            <div className="mr-1 flex h-8 items-center gap-2 rounded-md border border-generate/40 bg-generate/10 pr-2.5 pl-1.5 text-xs font-medium text-generate-ink">
              <ProgressRing value={value} />
              <span className="tabular">{waiting ? "Waiting" : `${Math.round(value * 100)}%`}</span>
              {queued > 0 ? <span className="text-fg-3">+{queued}</span> : null}
            </div>
          </Tooltip>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ComfyStatusButton() {
  const comfy = useLive((s) => s.comfy);
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  const connected = useLive((s) => s.connected);
  const queued = useLive(
    (s) => s.queue.jobs.filter((j) => j.state === "queued" || j.state === "running").length,
  );
  const [logs, setLogs] = useState(false);
  const state: ComfyState = comfy?.state ?? "stopped";
  const tone = !connected
    ? "danger"
    : state === "running"
      ? "success"
      : ["starting", "restarting", "stopping"].includes(state)
        ? "warning"
        : "danger";
  const label = connected ? STATE_LABEL[state] : "Not connected to the BlomboUI server";
  const managed = comfy?.mode === "managed";
  const busy = ["starting", "restarting", "stopping"].includes(state);

  return (
    <>
      <Popover
        placement="bottom-end"
        className="w-80 p-0"
        trigger={
          <button
            type="button"
            aria-label={label}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-field focus-ring data-[open]:bg-field"
          >
            <StatusDot tone={tone} pulse={busy} />
          </button>
        }
      >
        {(close) => (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-field text-fg-2">
                <Icon name="workflow" size={18} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-fg">{label}</span>
                <span className="truncate font-mono text-2xs text-fg-3">
                  {managed ? `slot ${comfy?.slot ?? "—"}` : "external"} ·{" "}
                  {comfy?.url.replace(/^https?:\/\//, "") ?? "—"}
                </span>
              </div>
            </div>
            {comfy?.message && state !== "running" ? (
              <p
                className={cn(
                  "flex items-start gap-2 border-b border-line px-3.5 py-2.5 text-xs",
                  ["crashed", "missing", "unreachable"].includes(state)
                    ? "text-warning"
                    : "text-fg-2",
                )}
              >
                <Icon name="info" size={13} className="mt-px shrink-0" />
                {comfy.message}
              </p>
            ) : null}
            {comfy?.restartNeeded ? (
              <p className="flex items-start gap-2 border-b border-line px-3.5 py-2.5 text-xs text-warning">
                <Icon name="refresh" size={13} className="mt-px shrink-0" />
                The profile's folders changed. Restart ComfyUI to use them.
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-y-1.5 px-3.5 py-3 text-xs">
              <dt className="text-fg-3">Version</dt>
              <dd className="text-right font-mono text-fg-2">{comfy?.version ?? "—"}</dd>
              <dt className="text-fg-3">Uptime</dt>
              <dd className="text-right font-mono text-fg-2">
                {running(state) ? uptime(comfy?.startedAt ?? null) : "—"}
              </dd>
              <dt className="text-fg-3">In queue</dt>
              <dd className="text-right font-mono text-fg-2">{queued}</dd>
            </dl>
            <div className="flex gap-1.5 border-t border-line p-2">
              <Button
                size="sm"
                variant="ghost"
                icon="external"
                disabled={state !== "running" || !comfy}
                onClick={() => {
                  if (comfy) void openWindow(comfy.url, "ComfyUI");
                  close();
                }}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="terminal"
                onClick={() => {
                  setLogs(true);
                  close();
                }}
              >
                Log
              </Button>
              <span className="ml-auto" />
              {managed && state === "missing" ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="download"
                  onClick={() => {
                    close();
                    useSettingsNav.getState().go("comfy");
                    if (profileId)
                      void navigate({
                        to: "/p/$profileId/$view",
                        params: { profileId, view: "settings" },
                      });
                  }}
                >
                  Install
                </Button>
              ) : null}
              {managed && (state === "stopped" || state === "crashed") ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="play"
                  onClick={() => void run(api.comfyStart, "Starting ComfyUI")}
                >
                  Start
                </Button>
              ) : null}
              {managed && state === "running" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="stop"
                  onClick={() => void run(api.comfyStop, "ComfyUI stopped")}
                >
                  Stop
                </Button>
              ) : null}
              {state === "running" || state === "unreachable" || state === "starting" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="refresh"
                  onClick={() => {
                    void run(
                      api.comfyRestart,
                      managed ? "Restarting ComfyUI" : "Reconnecting to ComfyUI",
                    );
                    close();
                  }}
                >
                  {managed ? "Restart" : "Reconnect"}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Popover>
      <ComfyLogs open={logs} onOpenChange={setLogs} />
    </>
  );
}

const running = (s: ComfyState) => s === "running";

function ErrorsButton() {
  const errors = useLive((s) => s.errors);
  return (
    <AnimatePresence>
      {errors.length > 0 ? (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={snappy}
        >
          <Popover
            placement="bottom-end"
            className="w-96 p-0"
            trigger={
              <IconButton
                icon="errors"
                label={`${errors.length} error${errors.length === 1 ? "" : "s"}`}
                tooltip={false}
                className="relative text-red-ink hover:bg-red/12 hover:text-red-ink"
                badge={<CountBubble count={errors.length} />}
              />
            }
          >
            {(close) => (
              <div className="flex max-h-[60vh] flex-col">
                <div className="scroll-quiet min-h-0 flex-1 overflow-auto p-1.5">
                  {errors.map((e) => (
                    <div key={e.id} className="flex gap-2.5 rounded-md px-2.5 py-2">
                      <Icon name="x-circle" size={15} className="mt-0.5 shrink-0 text-red-ink" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium text-fg">{e.title}</span>
                        <span className="text-xs break-words text-fg-2">{e.detail}</span>
                        <span className="font-mono text-2xs text-fg-4">
                          {new Date(e.at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end border-t border-line p-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="check"
                    onClick={() => {
                      dismissErrors();
                      close();
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
            )}
          </Popover>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
