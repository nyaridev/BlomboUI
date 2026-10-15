/**
 * Header system status: queue (only while busy), VRAM, GPU temperature, the three memory actions
 * with purpose-drawn icons, ComfyUI status, and an errors badge that exists only when needed.
 */
import { useSystemPreview, useSystemPreviewTicker } from "@client/features/preview/systemPreview";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { openWindow } from "@client/lib/platform";
import {
  Button,
  CountBubble,
  IconButton,
  Meter,
  Popover,
  StatusDot,
  Tooltip,
  toast,
} from "@client/ui";
import { PORTS } from "@shared/constants";
import { AnimatePresence, motion } from "motion/react";

function heatColor(c: number): string {
  if (c >= 85) return "var(--red-ink)";
  if (c >= 75) return "var(--orange-ink)";
  if (c >= 65) return "var(--yellow-ink)";
  return "var(--green-ink)";
}

export function SystemCluster({ onOpenErrors }: { onOpenErrors: () => void }) {
  useSystemPreviewTicker();
  const s = useSystemPreview();
  const comfyUrl = `http://127.0.0.1:${PORTS.comfy}`;
  const comfyTone =
    s.comfy === "running"
      ? "success"
      : s.comfy === "stopped" || s.comfy === "missing"
        ? "danger"
        : "warning";
  const comfyLabel = {
    running: "ComfyUI is running",
    starting: "ComfyUI is starting…",
    restarting: "ComfyUI is restarting…",
    stopped: "ComfyUI is stopped",
    missing: "ComfyUI is not installed",
  }[s.comfy];

  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence>
        {s.running ? (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={snappy}
            className="overflow-hidden"
          >
            <Tooltip content={`Generating · ${s.queue} more in queue`}>
              <button
                type="button"
                className="mr-1 flex h-8 items-center gap-2 rounded-md border border-generate/40 bg-generate/10 pr-2.5 pl-1.5 text-xs font-medium text-generate-ink focus-ring"
              >
                <ProgressRing value={s.progress} />
                <span className="tabular">{Math.round(s.progress * 100)}%</span>
                {s.queue > 0 ? <span className="text-fg-3">+{s.queue}</span> : null}
              </button>
            </Tooltip>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Tooltip content={`VRAM ${s.vramUsed.toFixed(1)} of ${s.vramTotal} GB in use`}>
        <div>
          <Meter
            label="VRAM"
            value={s.vramUsed}
            max={s.vramTotal}
            valueText={`${s.vramUsed.toFixed(1)}/${s.vramTotal}G`}
            width={64}
            className="max-[1100px]:hidden"
          />
        </div>
      </Tooltip>
      <Tooltip content="GPU temperature">
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 font-mono text-xs tabular max-[980px]:hidden">
          <Icon name="thermometer" size={14} style={{ color: heatColor(s.tempC) }} />
          <span style={{ color: heatColor(s.tempC) }} className="transition-colors duration-700">
            {s.tempC}°
          </span>
        </div>
      </Tooltip>

      <div className="ml-1 flex items-center">
        <IconButton
          icon="unload-models"
          label="Unload models from VRAM"
          shortcut="Shift U"
          onClick={() => toast("Models unloaded from VRAM", "success")}
        />
        <IconButton
          icon="free-cache"
          label="Free memory and node cache"
          onClick={() => toast("Memory and cache freed", "success")}
        />
        <IconButton
          icon="rescan-models"
          label="Rescan model folders"
          shortcut="R"
          onClick={() => toast("Model folders rescanned · 3 new", "info")}
        />
      </div>

      <Popover
        placement="bottom-end"
        className="w-72 p-0"
        trigger={
          <button
            type="button"
            aria-label={comfyLabel}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-field focus-ring data-[open]:bg-field"
          >
            <StatusDot
              tone={comfyTone}
              pulse={s.comfy === "starting" || s.comfy === "restarting"}
            />
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
                <span className="text-sm font-medium text-fg">{comfyLabel}</span>
                <span className="font-mono text-2xs text-fg-3">
                  slot latest · {comfyUrl.replace("http://", "")}
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-y-1.5 px-3.5 py-3 text-xs">
              <dt className="text-fg-3">Uptime</dt>
              <dd className="text-right font-mono text-fg-2">2h 14m</dd>
              <dt className="text-fg-3">Queue</dt>
              <dd className="text-right font-mono text-fg-2">{s.queue}</dd>
              <dt className="text-fg-3">Bridge extension</dt>
              <dd className="text-right text-success">installed</dd>
            </dl>
            <div className="flex gap-1.5 border-t border-line p-2">
              <Button
                size="sm"
                variant="ghost"
                icon="external"
                onClick={() => {
                  void openWindow(comfyUrl, "ComfyUI");
                  close();
                }}
              >
                Open ComfyUI
              </Button>
              <Button size="sm" variant="ghost" icon="terminal" onClick={close}>
                Logs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                className="ml-auto"
                onClick={() => {
                  s.set({ comfy: "restarting" });
                  setTimeout(() => useSystemPreview.getState().set({ comfy: "running" }), 2600);
                  close();
                }}
              >
                Restart
              </Button>
            </div>
          </div>
        )}
      </Popover>

      <AnimatePresence>
        {s.errors.length > 0 ? (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={snappy}
          >
            <IconButton
              icon="errors"
              label={`${s.errors.length} unread error${s.errors.length === 1 ? "" : "s"}`}
              onClick={onOpenErrors}
              className={cn("relative text-red-ink hover:bg-red/12 hover:text-red-ink")}
              badge={<CountBubble count={s.errors.length} />}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".2"
        strokeWidth="2.5"
      />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        style={{ transition: "stroke-dashoffset .6s ease-out" }}
      />
    </svg>
  );
}
