/**
 * The header's generation queue: overall progress while busy, and a popover listing the running
 * run (pinned at the top, it can't move) and the waiting ones, which drag into another order by
 * their handle (or Alt+↑ / Alt+↓ on it) and cancel one at a time. While a drag or a keyboard move
 * is on its way, the list shows the local order; it goes back to the server's once that agrees.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { snappy } from "@client/lib/motion";
import { DRAG_LIFT, moveItem, type Sortable, useSortableRow } from "@client/lib/sortable";
import { Button, IconButton, Popover, ProgressRing, Tooltip, toast } from "@client/ui";
import type { Job } from "@shared/jobs";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const fail = (e: unknown) =>
  toast(e instanceof Error ? e.message : "Couldn't change the queue.", "error");

export function QueueChip() {
  const jobs = useLive((s) => s.queue.jobs);
  const waiting = useLive((s) => s.queue.waiting);
  const overall = useLive((s) => s.progress?.progress.overall ?? 0);
  const active = jobs.find((j) => j.state === "running") ?? null;
  const queued = jobs.filter((j) => j.state === "queued");
  const busy = Boolean(active) || queued.length > 0;
  const value = active ? overall : 0;
  const label = waiting
    ? "Waiting for ComfyUI to be ready"
    : `Generating${queued.length ? ` · ${queued.length} more in queue` : ""}`;
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
          <Popover
            placement="bottom-end"
            className="w-[380px] p-0"
            trigger={
              <button
                type="button"
                aria-label={`${label}. Show the queue`}
                title={label}
                className="mr-1 flex h-8 items-center gap-2 rounded-md border border-generate/40 bg-generate/10 pr-2.5 pl-1.5 text-xs font-medium text-generate-ink focus-ring"
              >
                <ProgressRing value={value} />
                <span className="tabular">
                  {waiting ? "Waiting" : `${Math.round(value * 100)}%`}
                </span>
                {queued.length > 0 ? <span className="text-fg-3">+{queued.length}</span> : null}
              </button>
            }
          >
            {() => <QueueList active={active} queued={queued} overall={overall} />}
          </Popover>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function QueueList({
  active,
  queued,
  overall,
}: {
  active: Job | null;
  queued: Job[];
  overall: number;
}) {
  // The order being sent, until the server's list agrees with it.
  const [order, setOrder] = useState<string[] | null>(null);
  const ids = queued.map((j) => j.id);
  const byId = new Map(queued.map((j) => [j.id, j]));
  const shown = order
    ? [...order.filter((id) => byId.has(id)), ...ids.filter((id) => !order.includes(id))].flatMap(
        (id) => byId.get(id) ?? [],
      )
    : queued;

  const send = (next: string[]) =>
    void api.reorderQueue(next).catch((e) => {
      fail(e);
      setOrder(null);
    });

  // Alt+arrows send each step; a drag sends once, when it ends (below).
  const byKeys = useRef(false);
  const sortable = useSortableRow(shown.length, (from, to) => {
    const next = moveItem(
      shown.map((j) => j.id),
      from,
      to,
    );
    setOrder(next);
    if (byKeys.current) send(next);
  });
  const rows = shown.map((_, i): Sortable => {
    const row = sortable(i);
    return {
      ...row,
      onKeyDown: (e) => {
        byKeys.current = true;
        row.onKeyDown(e);
        byKeys.current = false;
      },
    };
  });
  const dragging = rows.some((r) => r.dragging);

  const wasDragging = useRef(false);
  useEffect(() => {
    if (wasDragging.current && !dragging && order) send(order);
    wasDragging.current = dragging;
  });

  // Back to the server's order once it matches (jobs that started or were added don't count).
  useEffect(() => {
    if (!order || dragging) return;
    const common = order.filter((id) => byId.has(id));
    const server = ids.filter((id) => order.includes(id));
    if (common.join() === server.join()) setOrder(null);
  });

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Icon name="queue" size={15} className="text-fg-3" />
        <span className="text-sm font-semibold text-fg">Queue</span>
        <span className="font-mono text-2xs text-fg-3 tabular">
          {queued.length + (active ? 1 : 0)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon="stop"
          className="ml-auto"
          onClick={() => void api.cancelAll().catch(fail)}
        >
          Cancel all
        </Button>
      </div>
      <ol className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
        {active ? <RunningRow job={active} overall={overall} /> : null}
        {shown.map((job, i) => (
          <QueuedRow key={job.id} job={job} place={i + 1} sortable={rows[i] as Sortable} />
        ))}
      </ol>
      {shown.length > 1 ? (
        <p className="border-t border-line px-3.5 py-2 text-2xs text-fg-3">
          Drag the waiting runs by their handle to change what runs next. The running one stays
          first.
        </p>
      ) : null}
    </div>
  );
}

function jobTitle(job: Job): string {
  return job.group ? `${job.group.title} · ${job.group.label}` : job.workflowName;
}

function jobDetail(job: Job): string {
  const parts = [
    job.group ? job.workflowName : null,
    job.seed !== null ? `seed ${job.seed}` : null,
    job.width && job.height ? `${job.width}×${job.height}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function RunningRow({ job, overall }: { job: Job; overall: number }) {
  return (
    <li className="flex items-center gap-2 rounded-md bg-generate/8 px-2 py-1.5">
      <Tooltip content="Running now. It can't be moved">
        <span className="grid h-7 w-5 shrink-0 place-items-center text-generate-ink">
          <Icon name="lock" size={13} />
        </span>
      </Tooltip>
      <ProgressRing value={overall} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-fg">{jobTitle(job)}</span>
        <span className="truncate font-mono text-2xs text-fg-3">
          Running · {Math.round(overall * 100)}%{jobDetail(job) ? ` · ${jobDetail(job)}` : ""}
        </span>
      </div>
      <IconButton
        icon="stop"
        size="sm"
        label="Stop this run"
        onClick={() => void api.cancelJob(job.id).catch(fail)}
      />
    </li>
  );
}

function QueuedRow({ job, place, sortable }: { job: Job; place: number; sortable: Sortable }) {
  return (
    <li
      ref={sortable.ref}
      className={cn(
        "relative flex items-center gap-2 rounded-md bg-surface-3 px-2 py-1.5 transition-[scale,box-shadow] duration-150",
        sortable.dragging && DRAG_LIFT,
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${jobTitle(job)} to reorder, number ${place} in line`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        {...sortable.handle}
        onKeyDown={sortable.onKeyDown}
        className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-xs text-fg-4 hover:text-fg-2 focus-ring active:cursor-grabbing"
      >
        <Icon name="grip" size={14} />
      </button>
      <span className="w-5 shrink-0 text-center font-mono text-2xs text-fg-3 tabular">{place}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg">{jobTitle(job)}</span>
        <span className="truncate font-mono text-2xs text-fg-3">{jobDetail(job) || "Waiting"}</span>
      </div>
      <IconButton
        icon="x"
        size="sm"
        label={`Remove ${jobTitle(job)} from the queue`}
        onClick={() => void api.cancelJob(job.id).catch(fail)}
      />
    </li>
  );
}
