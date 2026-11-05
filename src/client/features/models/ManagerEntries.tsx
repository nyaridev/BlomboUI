/**
 * Models → Manager's entries as a virtualized list (the catalog has hundreds of files). Each links to its Hugging Face repo (or the catalog's
 * project page), shows the repo's all-time downloads when Hugging Face reports them, and installs
 * through the download queue: Install opens a pop-up with the ComfyUI folder and file name the
 * catalog names, both changeable.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import { openWindow } from "@client/lib/platform";
import { useDownloadPlan } from "@client/lib/queries";
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  ProgressBar,
  Skeleton,
  Tooltip,
  toast,
} from "@client/ui";
import { compactCount } from "@shared/civitai";
import {
  type CatalogEntry,
  entryPage,
  STORE_CATEGORY_LABELS,
  type StoreCategory,
} from "@shared/manager";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef, useState } from "react";
import { Destination, useDestination, useQueueDownload } from "./civitai/DownloadDialog";

export const CATEGORY_ICON: Record<StoreCategory, IconName> = {
  checkpoints: "models",
  diffusion: "models",
  loras: "layers",
  vae: "wave",
  "text-encoders": "text",
  upscalers: "upscale",
  controlnet: "pose",
  detectors: "face-scan",
  face: "face-scan",
  "ip-adapter": "image",
  video: "play",
  other: "stack",
};

export type Row =
  | { type: "header"; category: StoreCategory; count: number }
  | { type: "entry"; entry: CatalogEntry };

/** What every row needs besides its entry. */
export interface EntryContext {
  noFolder: boolean;
  /** All-time downloads per Hugging Face repo; undefined while they load. */
  downloads: Record<string, number> | undefined;
}

const ROW_H = 68;
const HEADER_H = 40;

/** Hugging Face reports 0 for repos it doesn't count (no config file), so 0 shows as unknown. */
function downloadsOf(e: CatalogEntry, ctx: EntryContext): number | null | undefined {
  if (!e.repo) return null;
  if (!ctx.downloads) return undefined;
  return ctx.downloads[e.repo] || null;
}

function Downloads({ entry, ctx }: { entry: CatalogEntry; ctx: EntryContext }) {
  const n = downloadsOf(entry, ctx);
  if (n === undefined) return <Skeleton className="h-3 w-12" />;
  if (n === null) return null;
  return (
    <Tooltip content={`${n.toLocaleString()} downloads of ${entry.repo} on Hugging Face, all time`}>
      <span className="inline-flex items-center gap-1 font-mono tabular">
        <Icon name="download" size={11} className="text-fg-3" />
        {compactCount(n)}
      </span>
    </Tooltip>
  );
}

function PageButton({ entry: e }: { entry: CatalogEntry }) {
  const page = entryPage(e);
  if (!page) return null;
  return (
    <IconButton
      icon="external"
      size="xs"
      label={e.repo ? `Open ${e.repo} on Hugging Face` : "Open the project page"}
      onClick={() => void openWindow(page, e.name)}
    />
  );
}

function Badges({ entry: e }: { entry: CatalogEntry }) {
  return (
    <>
      {e.base ? <Badge className="shrink-0 whitespace-nowrap">{e.base}</Badge> : null}
      {e.folder && !e.standard ? (
        <Tooltip
          content={`ComfyUI finds files in ${e.folder}/ only through a custom node that reads it.`}
        >
          <span>
            <Badge className="shrink-0 whitespace-nowrap">Custom node folder</Badge>
          </span>
        </Tooltip>
      ) : null}
    </>
  );
}

const where = (e: CatalogEntry) => (e.folder ? `${e.folder}/${e.filename}` : e.filename);

/** Installed, installing, retry or Install (with its pop-up). */
function EntryAction({ entry: e, noFolder }: { entry: CatalogEntry; noFolder: boolean }) {
  const live = useLive((s) =>
    s.downloads.find((d) => d.entryId === e.id && d.state !== "done" && d.state !== "cancelled"),
  );
  const progress = useLive((s) => (live ? s.downloadProgress[live.id] : undefined));
  const [asking, setAsking] = useState(false);
  const fraction =
    live && (progress?.size ?? live.size)
      ? (progress?.received ?? live.received) / ((progress?.size ?? live.size) as number)
      : null;
  let action: ReactNode;
  if (e.installed)
    action = (
      <Badge tone="success">
        <Icon name="check" size={11} /> Installed
      </Badge>
    );
  else if (live && (live.state === "running" || live.state === "queued" || live.state === "paused"))
    action = (
      <>
        <div className="flex w-24 flex-col gap-1">
          <ProgressBar
            size="sm"
            value={live.state === "queued" ? 0 : fraction}
            label={`Installing ${e.name}`}
          />
          <span className="text-2xs text-fg-3 tabular">
            {live.state === "queued"
              ? "Waiting"
              : live.state === "paused"
                ? "Paused"
                : `${Math.round((fraction ?? 0) * 100)}%`}
          </span>
        </div>
        <IconButton
          icon="x"
          label="Cancel"
          size="xs"
          onClick={() =>
            void api.cancelDownload(live.id).catch((x: Error) => toast(x.message, "error"))
          }
        />
      </>
    );
  else if (live?.state === "error")
    action = (
      <Tooltip content={live.error ?? "The download failed."}>
        <Button
          size="sm"
          icon="refresh"
          variant="outline"
          onClick={() =>
            void api.resumeDownload(live.id).catch((x: Error) => toast(x.message, "error"))
          }
        >
          Retry
        </Button>
      </Tooltip>
    );
  else if (!e.folder || noFolder)
    action = (
      <Tooltip
        content={
          noFolder
            ? "Choose a models folder in Settings → Folders first."
            : "This file goes into a custom node's folder. Install it with ComfyUI Manager."
        }
      >
        <span>
          <Button size="sm" icon="download" disabled>
            Install
          </Button>
        </span>
      </Tooltip>
    );
  else
    action = (
      <Button size="sm" icon="download" onClick={() => setAsking(true)}>
        Install
      </Button>
    );
  return (
    <>
      {action}
      {asking ? <InstallDialog entry={e} onClose={() => setAsking(false)} /> : null}
    </>
  );
}

export function ManagerList({ rows, ctx }: { rows: Row[]; ctx: EntryContext }) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.type === "header" ? HEADER_H : ROW_H),
    overscan: 8,
  });
  return (
    <div
      ref={scroller}
      className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-5 max-lg:px-3"
    >
      <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          return (
            <div
              key={v.key}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${v.start}px)`, height: v.size }}
            >
              {row.type === "header" ? (
                <h3 className="label-caps flex h-full items-end gap-2 pb-2">
                  {STORE_CATEGORY_LABELS[row.category]}
                  <span className="font-mono text-fg-4">{row.count}</span>
                </h3>
              ) : (
                <ListRow entry={row.entry} ctx={ctx} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListRow({ entry: e, ctx }: { entry: CatalogEntry; ctx: EntryContext }) {
  return (
    <div className="flex h-[60px] items-center gap-3 rounded-lg border border-line bg-surface px-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-field text-fg-2 max-lg:hidden">
        <Icon name={CATEGORY_ICON[e.category]} size={17} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg" title={e.name}>
            {e.name}
          </span>
          <Badges entry={e} />
        </div>
        <span className="truncate text-2xs text-fg-3" title={e.description}>
          {[e.size ? formatBytes(e.size) : null, where(e), e.host].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="flex w-60 shrink-0 items-center justify-end gap-1.5 max-lg:w-auto">
        <span className="text-2xs text-fg-3 max-lg:hidden">
          <Downloads entry={e} ctx={ctx} />
        </span>
        <PageButton entry={e} />
        <EntryAction entry={e} noFolder={ctx.noFolder} />
      </div>
    </div>
  );
}

/** Install's pop-up: the catalog's folder and file name, both changeable before it downloads. */
function InstallDialog({ entry: e, onClose }: { entry: CatalogEntry; onClose: () => void }) {
  const d = useDestination();
  const base = { source: "manager" as const, entryId: e.id };
  const plan = useDownloadPlan({ ...base, ...d.typed });
  const p = plan.data;
  const queue = useQueueDownload(onClose);
  const ready = Boolean(p && !p.blocked && !p.installed && !plan.isFetching);
  const install = () => ready && queue.run({ ...base, ...d.now });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Install ${e.name}`} width={560}>
      <div className="flex flex-col gap-4">
        {e.description ? <p className="text-sm text-pretty text-fg-2">{e.description}</p> : null}
        <Destination
          d={d}
          plan={plan}
          nameHint="Some nodes look for this exact name; change it only if you know the node allows it."
          onEnter={install}
          onClose={onClose}
        />
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon="undo" disabled={!d.changed} onClick={d.reset}>
            Back to the catalog's
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="download"
            loading={queue.pending}
            disabled={!ready}
            onClick={install}
          >
            Install
            {e.size ? (
              <span className="font-normal opacity-75">· {formatBytes(e.size)}</span>
            ) : null}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
