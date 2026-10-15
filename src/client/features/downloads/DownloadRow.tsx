/**
 * One download, the same everywhere it shows (the header's downloads popover, History, a model
 * page): what it is, where it goes, its progress from the live bus, and the actions its state
 * allows (pause, resume or retry, cancel, reveal, show in Models).
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { formatBytes, formatEta } from "@client/lib/number";
import { Badge, IconButton, KIND_STYLE, ProgressBar, toast } from "@client/ui";
import type { Download } from "@shared/downloads";
import { openCivitaiModel } from "../models/civitai/state";
import { useModelsNav } from "../models/nav";

async function act(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
  }
}

const STATE_LABEL: Record<Download["state"], string> = {
  queued: "Waiting",
  running: "Downloading",
  paused: "Paused",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

export function DownloadThumb({ d, size = 40 }: { d: Download; size?: number }) {
  const style = d.kind ? KIND_STYLE[d.kind] : null;
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-field text-fg-2"
      style={{ width: size, height: Math.round(size * 1.25) }}
    >
      {d.thumb ? (
        <img
          src={d.thumb}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon
          name={style?.icon ?? "download"}
          size={16}
          style={style ? { color: `var(--${style.color}-ink)` } : undefined}
        />
      )}
    </span>
  );
}

export function DownloadRow({ d, dense }: { d: Download; dense?: boolean }) {
  const p = useLive((s) => s.downloadProgress[d.id]);
  const goTo = useGoToView();
  const received = p?.received ?? d.received;
  const size = p?.size ?? d.size;
  const fraction = size ? received / size : null;
  const running = d.state === "running";
  const tone = d.state === "error" ? "danger" : d.state === "done" ? "success" : "accent";

  const status =
    d.state === "running"
      ? [
          size ? `${formatBytes(received)} of ${formatBytes(size)}` : formatBytes(received),
          p?.speed ? `${formatBytes(p.speed)}/s` : null,
          size && p?.speed ? formatEta(size - received, p.speed) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : d.state === "done"
        ? `${size ? formatBytes(size) : ""}${d.finishedAt ? ` · ${new Date(d.finishedAt).toLocaleString()}` : ""}`
        : d.state === "paused" && received > 0 && size
          ? `${formatBytes(received)} of ${formatBytes(size)} · resumes where it stopped`
          : d.state === "queued"
            ? "Starts when a download slot is free"
            : null;

  return (
    <div className={cn("flex items-center gap-3", dense ? "px-2.5 py-2" : "px-4 py-3")}>
      <DownloadThumb d={d} size={dense ? 32 : 40} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-fg" title={d.name}>
            {d.name}
          </span>
          {d.state !== "running" ? (
            <Badge
              tone={
                d.state === "done"
                  ? "success"
                  : d.state === "error"
                    ? "danger"
                    : d.state === "paused"
                      ? "warning"
                      : "neutral"
              }
              className="shrink-0"
            >
              {STATE_LABEL[d.state]}
            </Badge>
          ) : null}
        </div>
        <span className="truncate font-mono text-2xs text-fg-3" title={d.dest}>
          {d.dest}
        </span>
        {d.state === "running" || d.state === "paused" || d.state === "queued" ? (
          <ProgressBar
            size="sm"
            value={d.state === "queued" ? 0 : fraction}
            tone={tone}
            label={`${d.name}: ${STATE_LABEL[d.state]}`}
          />
        ) : null}
        {d.state === "error" && d.error ? (
          <span className="flex items-start gap-1 text-xs text-danger">
            <Icon name="x-circle" size={13} className="mt-px shrink-0" />
            {d.error}
          </span>
        ) : status ? (
          <span className="text-2xs text-fg-3 tabular">{status}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {running ? (
          <IconButton
            icon="pause"
            label="Pause"
            size="sm"
            onClick={() => void act(() => api.pauseDownload(d.id))}
          />
        ) : null}
        {d.state === "paused" || d.state === "error" || d.state === "cancelled" ? (
          <IconButton
            icon={d.state === "paused" ? "play" : "refresh"}
            label={d.state === "paused" ? "Resume" : "Retry"}
            size="sm"
            onClick={() => void act(() => api.resumeDownload(d.id))}
          />
        ) : null}
        {d.state === "done" ? (
          <>
            <IconButton
              icon="models"
              label="Show in Models"
              size="sm"
              onClick={() => {
                useModelsNav.getState().showLocal(d.dest);
                goTo("models");
              }}
            />
            <IconButton
              icon="folder-open"
              label="Show in Explorer"
              size="sm"
              onClick={() => void act(() => api.revealDownload(d.id))}
            />
          </>
        ) : null}
        {d.source === "civitai" && d.modelId && !dense ? (
          <IconButton
            icon="globe"
            label="Open its Civitai page"
            size="sm"
            onClick={() => {
              openCivitaiModel(d.modelId as number, d.name.split(" · ")[0] ?? d.name);
              goTo("models");
            }}
          />
        ) : null}
        {d.state === "running" ||
        d.state === "queued" ||
        d.state === "paused" ||
        d.state === "error" ? (
          <IconButton
            icon="x"
            label={d.state === "error" ? "Discard the partial file" : "Cancel"}
            size="sm"
            onClick={() => void act(() => api.cancelDownload(d.id))}
          />
        ) : null}
      </div>
    </div>
  );
}
